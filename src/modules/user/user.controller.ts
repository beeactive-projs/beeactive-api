import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { UserDocs } from '../../common/docs/user.docs';

/**
 * User Controller
 *
 * Handles user-related endpoints:
 * - GET    /users/me → Get current user profile
 * - PATCH  /users/me → Update user core fields
 * - DELETE /users/me → Delete account (GDPR)
 *
 * All endpoints require JWT authentication.
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Get Current User Profile
   */
  @Get('me')
  @ApiEndpoint(UserDocs.getProfile)
  getProfile(@Request() req) {
    return {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      phone: req.user.phone,
      avatarId: req.user.avatarId,
      language: req.user.language,
      timezone: req.user.timezone,
      isActive: req.user.isActive,
      isEmailVerified: req.user.isEmailVerified,
      roles: req.user.roles,
      createdAt: req.user.createdAt,
    };
  }

  /**
   * Update core user fields (name, phone, avatar, language, timezone)
   */
  @Patch('me')
  @ApiEndpoint({ ...UserDocs.updateProfile, body: UpdateUserDto })
  async updateProfile(@Request() req, @Body() dto: UpdateUserDto) {
    const user = await this.userService.updateUser(req.user.id, dto);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarId: user.avatarId,
      language: user.language,
      timezone: user.timezone,
    };
  }

  /**
   * Delete account (GDPR - soft delete)
   */
  @Delete('me')
  @ApiEndpoint(UserDocs.deleteAccount)
  async deleteAccount(@Request() req) {
    await this.userService.deleteAccount(req.user.id);
    return { message: 'Account deleted successfully' };
  }
}
