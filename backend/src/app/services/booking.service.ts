import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingDocument } from '../schemas/booking.schema';
import { Classroom, ClassroomDocument } from '../schemas/classroom.schema';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
    @InjectModel(Classroom.name) private classroomModel: Model<ClassroomDocument>
  ) {}

  async create(data: {
    teacherId: string;
    studentId: string;
    scheduledTime: Date;
    durationMinutes?: number;
  }): Promise<Booking> {
    const booking = new this.bookingModel({
      teacherId: new Types.ObjectId(data.teacherId),
      studentId: new Types.ObjectId(data.studentId),
      scheduledTime: data.scheduledTime,
      durationMinutes: data.durationMinutes || 60,
      status: 'pending',
    });
    return booking.save();
  }

  async findForUser(userId: string): Promise<Booking[]> {
    const userObjId = new Types.ObjectId(userId);
    return this.bookingModel
      .find({
        $or: [{ teacherId: userObjId }, { studentId: userObjId }],
      })
      .populate('teacherId', 'name email role')
      .populate('studentId', 'name email role')
      .populate('classroomId')
      .sort({ scheduledTime: 1 })
      .exec();
  }

  async updateStatus(bookingId: string, status: 'confirmed' | 'cancelled'): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId).exec();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    booking.status = status;

    if (status === 'confirmed' && !booking.classroomId) {
      // Create classroom automatically for this tuition
      const classroom = new this.classroomModel({
        title: `Private Tuition Session`,
        description: `1-on-1 private tuition class`,
        creatorId: booking.teacherId,
        type: 'private_tuition',
        isPrivate: true,
        status: 'scheduled',
        scheduledTime: booking.scheduledTime,
        participants: [booking.teacherId, booking.studentId],
      });
      const savedClassroom = await classroom.save();
      booking.classroomId = savedClassroom._id as Types.ObjectId;
    }

    return booking.save();
  }
}
