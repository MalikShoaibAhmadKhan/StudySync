import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { UserService } from '../services/user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  async login(@Body() body: { email: string; name: string; role: string }) {
    return this.userService.createOrLogin(body.email, body.name, body.role);
  }

  @Post('register')
  async register(
    @Body() body: { email: string; name: string; role: string; bio?: string; skills?: string[] }
  ) {
    return this.userService.register(body.email, body.name, body.role, body.bio, body.skills);
  }

  @Get('teachers')
  async getTeachers() {
    return this.userService.findAllTeachers();
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Put(':id')
  async updateProfile(
    @Param('id') id: string,
    @Body() body: { name: string; bio: string; skills: string[] }
  ) {
    return this.userService.updateProfile(id, body.name, body.bio, body.skills);
  }
}
