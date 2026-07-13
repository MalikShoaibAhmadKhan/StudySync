import { Injectable, NotFoundException, OnModuleInit, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) {}

  async onModuleInit() {
    await this.seedDummyUsers();
  }

  async seedDummyUsers() {
    // Seed Student
    const studentEmail = 'student@studysync.com';
    const student = await this.userModel.findOne({ email: studentEmail }).exec();
    if (!student) {
      const newStudent = new this.userModel({
        email: studentEmail,
        name: 'Alex Student',
        role: 'student',
        bio: 'Enthusiastic learner looking to master full-stack web development.',
        skills: ['HTML', 'CSS', 'JavaScript'],
      });
      await newStudent.save();
    }

    // Seed Teacher
    const teacherEmail = 'teacher@studysync.com';
    const teacher = await this.userModel.findOne({ email: teacherEmail }).exec();
    if (!teacher) {
      const newTeacher = new this.userModel({
        email: teacherEmail,
        name: 'Dr. Smith (Tutor)',
        role: 'teacher',
        bio: 'Senior Full-Stack Developer and educator with 10+ years of experience.',
        skills: ['Angular', 'NestJS', 'TypeScript', 'MongoDB'],
      });
      await newTeacher.save();
    }
  }

  async register(email: string, name: string, role: string, bio?: string, skills?: string[]): Promise<User> {
    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    const user = new this.userModel({ email, name, role, bio: bio || '', skills: skills || [] });
    return await user.save();
  }

  async createOrLogin(email: string, name: string, role: string): Promise<User> {
    let user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      user = new this.userModel({ email, name, role });
      await user.save();
    }
    return user;
  }

  async findAllTeachers(): Promise<User[]> {
    return this.userModel.find({ role: 'teacher' }).exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(id: string, name: string, bio: string, skills: string[]): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { name, bio, skills },
      { new: true }
    ).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
