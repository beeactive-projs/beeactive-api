import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { AuthDocs } from '../../common/docs/auth.docs';

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
  @ApiEndpoint({ ...AuthDocs.register, body: RegisterDto })
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
  @ApiEndpoint({ ...AuthDocs.login, body: LoginDto })
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
  @ApiEndpoint({ ...AuthDocs.refreshToken, body: RefreshTokenDto })
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
  @ApiEndpoint({ ...AuthDocs.forgotPassword, body: ForgotPasswordDto })
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
  @ApiEndpoint({ ...AuthDocs.resetPassword, body: ResetPasswordDto })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
