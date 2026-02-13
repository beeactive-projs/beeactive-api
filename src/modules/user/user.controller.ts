import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { UserDocs } from '../../common/docs/user.docs';

/**
 * User Controller
 *
 * Handles user-related endpoints:
 * - GET /users/me → Get current user profile
 *
 * All endpoints require JWT authentication.
 */
@ApiTags('Users')
@Controller('users')
export class UserController {
  /**
   * Get Current User Profile
   *
   * Returns the authenticated user's profile information.
   * The user is identified from the JWT token.
   *
   * @param req - Express request with user attached by JwtStrategy
   * @returns User profile data
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(UserDocs.getProfile)
  getProfile(@Request() req) {
    // Return sanitized user data (exclude sensitive fields)
    // req.user already includes roles from JwtStrategy
    return {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      phone: req.user.phone,
      isActive: req.user.isActive,
      isEmailVerified: req.user.isEmailVerified,
      roles: req.user.roles,
      createdAt: req.user.createdAt,
    };
  }
}
