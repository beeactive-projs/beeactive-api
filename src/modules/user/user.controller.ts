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
    return {
      id: req.user.id,
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      phone: req.user.phone,
      is_active: req.user.is_active,
      is_email_verified: req.user.is_email_verified,
      created_at: req.user.created_at,
    };
  }
}
