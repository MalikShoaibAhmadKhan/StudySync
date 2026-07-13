import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ClassroomService } from '../services/classroom.service';

@Controller('classrooms')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post()
  async create(
    @Body()
    body: {
      title: string;
      description?: string;
      creatorId: string;
      type: string;
      isPrivate?: boolean;
      passcode?: string;
      scheduledTime: string;
    }
  ) {
    return this.classroomService.create({
      ...body,
      scheduledTime: new Date(body.scheduledTime),
    });
  }

  @Get()
  async getAll(@Query('userId') userId: string) {
    return this.classroomService.findAll(userId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.classroomService.findById(id);
  }

  @Post(':id/join')
  async join(
    @Param('id') id: string,
    @Body() body: { userId: string; passcode?: string }
  ) {
    return this.classroomService.join(id, body.userId, body.passcode);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'scheduled' | 'live' | 'ended' }
  ) {
    return this.classroomService.updateStatus(id, body.status);
  }
}
