import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Schemas
import { User, UserSchema } from './schemas/user.schema';
import { Classroom, ClassroomSchema } from './schemas/classroom.schema';
import { Booking, BookingSchema } from './schemas/booking.schema';

// Services
import { UserService } from './services/user.service';
import { ClassroomService } from './services/classroom.service';
import { BookingService } from './services/booking.service';

// Controllers
import { UserController } from './controllers/user.controller';
import { ClassroomController } from './controllers/classroom.controller';
import { BookingController } from './controllers/booking.controller';

// Gateways
import { CollaborationGateway } from './gateways/collaboration.gateway';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/studysync'),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [
    AppController,
    UserController,
    ClassroomController,
    BookingController,
  ],
  providers: [
    AppService,
    UserService,
    ClassroomService,
    BookingService,
    CollaborationGateway,
  ],
})
export class AppModule {}

