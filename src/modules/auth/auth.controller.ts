import { Controller, Post, Get, Body, Query, Res, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { FacebookAuthDto } from './dto/facebook-auth.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { AuthDocs } from '../../common/docs/auth.docs';

/**
 * Authentication Controller
 *
 * Handles all authentication-related HTTP endpoints:
 * - POST /auth/register → Create new account
 * - POST /auth/login → Login existing user
 * - POST /auth/refresh → Get new access token
 * - POST /auth/logout → Invalidate refresh token
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
   * Creates account, assigns USER role, returns JWT tokens.
   * Rate limit: 3 requests per hour (prevents spam account creation)
   */
  @Post('register')
  // @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
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
   * Logout user
   *
   * Invalidates the provided refresh token.
   * Rate limit: 10 requests per 15 minutes
   */
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @ApiEndpoint({ ...AuthDocs.logout, body: RefreshTokenDto })
  async logout(@Body() refreshTokenDto: RefreshTokenDto, @Request() req) {
    return this.authService.logout(refreshTokenDto.refreshToken, req.user.id);
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

  /**
   * Verify email
   *
   * Verify user email using token sent during registration.
   * Rate limit: 5 requests per hour
   */
  @Post('verify-email')
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour
  @ApiEndpoint({ ...AuthDocs.verifyEmail, body: VerifyEmailDto })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  /**
   * Verify email (GET - browser-friendly)
   *
   * Used in development for direct verification via email link.
   * In production, the frontend handles this and calls POST /auth/verify-email.
   */
  @Get('verify-email')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async verifyEmailGet(@Query('token') token: string, @Res() res: Response) {
    const successHtml = `<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef3c7;"><div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);"><h1 style="color:#f59e0b;">Email Verified!</h1><p>Your email has been verified successfully. You can close this page.</p></div></body></html>`;
    const errorHtml = `<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef2f2;"><div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);"><h1 style="color:#ef4444;">Verification Failed</h1><p>This link is invalid or has expired. Please request a new verification email.</p></div></body></html>`;

    try {
      await this.authService.verifyEmail({ token });
      res.status(200).send(successHtml);
    } catch (_err) {
      res.status(400).send(errorHtml);
    }
  }

  /**
   * Resend verification email
   *
   * Resend email verification link if not yet verified.
   * Rate limit: 2 requests per hour (prevents email spam)
   */
  @Post('resend-verification')
  @Throttle({ default: { limit: 2, ttl: 3600000 } }) // 2 requests per hour
  @ApiEndpoint({
    ...AuthDocs.resendVerification,
    body: ResendVerificationDto,
  })
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    return this.authService.resendVerification(resendVerificationDto);
  }

  /**
   * Sign in with Google (token flow)
   *
   * Frontend obtains ID token from Google Sign-In, sends it here.
   * Returns same JWT + user shape as login/register.
   */
  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @ApiEndpoint({ ...AuthDocs.google, body: GoogleAuthDto })
  async google(@Body() dto: GoogleAuthDto) {
    return this.authService.registerWithGoogle(dto.idToken);
  }

  /**
   * Sign in with Facebook (token flow)
   *
   * Frontend obtains access token from Facebook Login SDK, sends it here.
   * Returns same JWT + user shape as login/register.
   */
  @Post('facebook')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @ApiEndpoint({ ...AuthDocs.facebook, body: FacebookAuthDto })
  async facebook(@Body() dto: FacebookAuthDto) {
    return this.authService.registerWithFacebook(dto.accessToken);
  }
}
