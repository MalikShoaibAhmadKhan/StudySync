import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['student', 'teacher'], default: 'student' })
  role: string;

  @Prop()
  bio: string;

  @Prop({ type: [String], default: [] })
  skills: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
