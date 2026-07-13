import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClassroomDocument = Classroom & Document;

@Schema({ timestamps: true })
export class Classroom {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ required: true, enum: ['public_class', 'private_tuition', 'one_on_one'] })
  type: string;

  @Prop({ required: true, default: false })
  isPrivate: boolean;

  @Prop()
  passcode: string;

  @Prop({ required: true, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' })
  status: string;

  @Prop({ required: true })
  scheduledTime: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  participants: Types.ObjectId[];
}

export const ClassroomSchema = SchemaFactory.createForClass(Classroom);
