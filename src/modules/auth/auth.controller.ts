import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';

/**
 * Authentication Controller
 *
 * Handles all authentication-related HTTP endpoints:
 * - POST /auth/register → Create new account
 * - POST /auth/login → Login existing user
 * - POST /auth/refresh → Get new access token
 * - POST /auth/forgot-password → Request password reset
 * - POST /auth/reset-password → Reset password with token
 *
 * All endpoints are rate-limited to prevent abuse.
 * Decorator order matters in NestJS!
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user
   *
   * Creates account, assigns PARTICIPANT role, returns JWT tokens.
   * Rate limit: 3 requests per hour (prevents spam account creation)
   */
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  @ApiEndpoint({
    summary: 'Register a new user',
    description:
      'Create a new user account with email and password. Automatically assigns PARTICIPANT role.',
    body: RegisterDto,
    responses: [
      {
        status: 201,
        description: 'User successfully registered',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
        },
      },
      ApiStandardResponses.BadRequest,
      { status: 409, description: 'User with this email already exists' },
      ApiStandardResponses.TooManyRequests,
    ],
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * Login user
   *
   * Validates credentials, returns JWT tokens.
   * Rate limit: 5 requests per 15 minutes (prevents brute force)
   * Additional protection: Account locks after 5 failed attempts
   */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 requests per 15 minutes
  @ApiEndpoint({
    summary: 'Login user',
    description:
      'Authenticate with email and password. Account locks after 5 failed attempts.',
    body: LoginDto,
    responses: [
      {
        status: 200,
        description: 'User successfully logged in',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
        },
      },
      {
        status: 401,
        description: 'Invalid credentials or account locked',
      },
      ApiStandardResponses.TooManyRequests,
    ],
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Refresh access token
   *
   * Get a new access token using refresh token.
   * Rate limit: 10 requests per 15 minutes
   */
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 requests per 15 minutes
  @ApiEndpoint({
    summary: 'Refresh access token',
    description:
      'Get a new access token using a valid refresh token. Use this when your access token expires.',
    body: RefreshTokenDto,
    responses: [
      {
        status: 200,
        description: 'New access token generated',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.TooManyRequests,
    ],
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
  }

  /**
   * Forgot password
   *
   * Request a password reset email.
   * Rate limit: 3 requests per hour (prevents email spam)
   */
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  @ApiEndpoint({
    summary: 'Request password reset',
    description:
      'Send a password reset email. Returns success even if email not found (security).',
    body: ForgotPasswordDto,
    responses: [
      {
        status: 200,
        description: 'Password reset email sent (if email exists)',
        example: {
          message:
            'If your email is registered, you will receive a password reset link.',
        },
      },
      ApiStandardResponses.TooManyRequests,
    ],
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Reset password
   *
   * Reset password using token from email.
   * Rate limit: 5 requests per hour
   */
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour
  @ApiEndpoint({
    summary: 'Reset password',
    description:
      'Reset password using the token received via email. Token expires after 1 hour.',
    body: ResetPasswordDto,
    responses: [
      {
        status: 200,
        description: 'Password successfully reset',
        example: {
          message: 'Password successfully reset. You can now log in.',
        },
      },
      {
        status: 400,
        description: 'Invalid or expired reset token',
      },
      ApiStandardResponses.TooManyRequests,
    ],
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
