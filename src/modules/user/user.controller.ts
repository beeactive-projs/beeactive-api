import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';

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
  @ApiEndpoint({
    summary: 'Get current user profile',
    description:
      'Returns the profile of the currently authenticated user. Requires valid JWT token.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'User profile retrieved successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'user@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+40123456789',
          is_active: true,
          is_email_verified: false,
          created_at: '2024-01-15T10:30:00.000Z',
        },
      },
      ApiStandardResponses.Unauthorized,
    ],
  })
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
