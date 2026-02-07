'use strict';

import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
export class UserController {
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req) {
    return {
      id: req.user.id,
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
    };
  }
}
