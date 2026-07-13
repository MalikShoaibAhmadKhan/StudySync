import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookingDocument = Booking & Document;

@Schema({ timestamps: true })
export class Booking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  teacherId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  scheduledTime: Date;

  @Prop({ required: true, default: 60 })
  durationMinutes: number;

  @Prop({ required: true, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Classroom' })
  classroomId: Types.ObjectId;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
