import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Classroom, ClassroomDocument } from '../schemas/classroom.schema';

@Injectable()
export class ClassroomService {
  constructor(
    @InjectModel(Classroom.name) private classroomModel: Model<ClassroomDocument>
  ) {}

  async create(data: {
    title: string;
    description?: string;
    creatorId: string;
    type: string;
    isPrivate?: boolean;
    passcode?: string;
    scheduledTime: Date;
  }): Promise<Classroom> {
    const classroom = new this.classroomModel({
      ...data,
      creatorId: new Types.ObjectId(data.creatorId),
      isPrivate: data.isPrivate || false,
      status: 'scheduled',
      participants: [new Types.ObjectId(data.creatorId)],
    });
    return classroom.save();
  }

  async findAll(userId: string): Promise<Classroom[]> {
    const userObjectId = new Types.ObjectId(userId);
    return this.classroomModel
      .find({
        $or: [
          { isPrivate: false },
          { creatorId: userObjectId },
          { participants: userObjectId },
        ],
      })
      .populate('creatorId', 'name email role')
      .sort({ scheduledTime: 1 })
      .exec();
  }

  async findById(id: string): Promise<Classroom> {
    const classroom = await this.classroomModel
      .findById(id)
      .populate('creatorId', 'name email role')
      .populate('participants', 'name email role')
      .exec();
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }

  async join(classroomId: string, userId: string, passcode?: string): Promise<Classroom> {
    const classroom = await this.classroomModel.findById(classroomId).exec();
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    if (classroom.isPrivate && classroom.passcode && classroom.passcode !== passcode) {
      const userObjId = new Types.ObjectId(userId);
      // Allow if already joined or if they are the creator
      if (!classroom.creatorId.equals(userObjId) && !classroom.participants.some(p => p.equals(userObjId))) {
        throw new ForbiddenException('Invalid passcode for this private room');
      }
    }

    const userObjectId = new Types.ObjectId(userId);
    if (!classroom.participants.some(p => p.equals(userObjectId))) {
      classroom.participants.push(userObjectId);
      await classroom.save();
    }

    return this.findById(classroomId);
  }

  async updateStatus(classroomId: string, status: 'scheduled' | 'live' | 'ended'): Promise<Classroom> {
    const classroom = await this.classroomModel.findByIdAndUpdate(
      classroomId,
      { status },
      { new: true }
    ).exec();
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }
    return classroom;
  }
}
