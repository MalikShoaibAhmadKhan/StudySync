import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { BookingService } from '../services/booking.service';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  async create(
    @Body()
    body: {
      teacherId: string;
      studentId: string;
      scheduledTime: string;
      durationMinutes?: number;
    }
  ) {
    return this.bookingService.create({
      ...body,
      scheduledTime: new Date(body.scheduledTime),
    });
  }

  @Get()
  async getForUser(@Query('userId') userId: string) {
    return this.bookingService.findForUser(userId);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'confirmed' | 'cancelled' }
  ) {
    return this.bookingService.updateStatus(id, body.status);
  }
}
