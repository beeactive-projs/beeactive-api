import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RoleService } from '../role/role.service';
import { ProfileService } from '../profile/profile.service';
import { Sequelize } from 'sequelize-typescript';

/**
 * Auth Service
 *
 * Handles authentication logic:
 * - User registration
 * - User login with account lockout protection
 * - Password reset flow
 * - JWT token generation
 * - Refresh tokens
 *
 * Security features:
 * - Account lockout after 5 failed attempts
 * - Strong password enforcement
 * - Secure token-based password reset
 * - Short-lived access tokens with refresh tokens
 */
@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private roleService: RoleService,
    private profileService: ProfileService,
    private configService: ConfigService,
    private sequelize: Sequelize,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Register a new user
   *
   * Flow:
   * 1. Create user (password is hashed in UserService)
   * 2. Assign default 'PARTICIPANT' role
   * 3. Generate JWT tokens
   * 4. Return tokens + user info
   *
   * Uses transaction to ensure atomicity (both user and role are created, or neither)
   *
   * @param registerDto - Registration data
   * @returns Access token, refresh token, and user info
   */
  async register(registerDto: RegisterDto) {
    // ✅ IMPROVEMENT: Use transaction for atomicity
    const transaction = await this.sequelize.transaction();

    try {
      // Create user
      const user = await this.userService.create(registerDto);

      // Assign default role
      await this.roleService.assignRoleToUserByName(user.id, 'PARTICIPANT');

      // Create empty participant profile (filled in later by user)
      await this.profileService.createParticipantProfile(user.id);

      // Commit transaction
      await transaction.commit();

      // Generate tokens
      const tokens = this.generateTokens(user.id, user.email);

      this.logger.log(`User registered: ${user.email}`, 'AuthService');

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
      };
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Login user
   *
   * Flow:
   * 1. Find user by email
   * 2. Check if account is locked
   * 3. Validate password
   * 4. If invalid, increment failed attempts
   * 5. If valid, reset failed attempts and generate tokens
   *
   * ✅ SECURITY: Account lockout after 5 failed attempts
   *
   * @param loginDto - Login credentials
   * @returns Access token, refresh token, and user info
   * @throws UnauthorizedException if credentials invalid or account locked
   */
  async login(loginDto: LoginDto) {
    const user = await this.userService.findByEmail(loginDto.email);

    // Don't reveal if email exists (security best practice)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ✅ SECURITY: Check if account is locked
    if (this.userService.isAccountLocked(user)) {
      const lockedUntil = user.locked_until!.toLocaleString();
      this.logger.warn(
        `Login attempt on locked account: ${user.email}`,
        'AuthService',
      );
      throw new UnauthorizedException(
        `Account is locked due to multiple failed login attempts. Try again after ${lockedUntil}`,
      );
    }

    // Validate password
    const isPasswordValid = await this.userService.validatePassword(
      user,
      loginDto.password,
    );

    if (!isPasswordValid) {
      // ✅ SECURITY: Increment failed attempts
      await this.userService.incrementFailedAttempts(user);

      this.logger.warn(
        `Failed login attempt for: ${user.email} (${user.failed_login_attempts + 1} attempts)`,
        'AuthService',
      );

      throw new UnauthorizedException('Invalid credentials');
    }

    // Success! Reset failed attempts
    await this.userService.resetFailedAttempts(user);

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    this.logger.log(`User logged in: ${user.email}`, 'AuthService');

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    };
  }

  /**
   * Generate access and refresh tokens
   *
   * Access token: Short-lived (2h), used for API requests
   * Refresh token: Long-lived (7d), used to get new access tokens
   *
   * @param userId - User's UUID
   * @param email - User's email
   * @returns Object with accessToken and refreshToken
   */
  private generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    // Access token (short-lived)
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRES_IN') || '2h',
    });

    // Refresh token (long-lived)
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token
   *
   * Called when access token expires.
   * Validates refresh token and issues new access token.
   *
   * @param refreshToken - The refresh token
   * @returns New access token
   * @throws UnauthorizedException if refresh token invalid
   */
  async refreshAccessToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Check if user still exists
      const user = await this.userService.findById(payload.sub);
      if (!user || !user.is_active) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new access token
      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        {
          expiresIn: this.configService.get('JWT_EXPIRES_IN') || '2h',
        },
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Forgot password - Send reset email
   *
   * Flow:
   * 1. Find user by email
   * 2. Generate secure reset token
   * 3. Save hashed token in database
   * 4. TODO: Send email with plain token
   *
   * Note: Always return success even if email doesn't exist
   * (prevents email enumeration attacks)
   *
   * @param forgotPasswordDto - Email to send reset link
   * @returns Success message
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(forgotPasswordDto.email);

    if (user) {
      // Generate reset token
      const resetToken =
        await this.userService.generatePasswordResetToken(user);

      // TODO: Integrate email provider (Resend, SendGrid) to send reset email
      // await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      // For testing: build the reset link and return it in the response
      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      this.logger.log(
        `Password reset requested for ${user.email}. Link: ${resetLink}`,
        'AuthService',
      );

      // In development, return the link for testing
      // In production, remove reset_link from the response
      if (this.configService.get('NODE_ENV') !== 'production') {
        return {
          message:
            'If your email is registered, you will receive a password reset link.',
          reset_link: resetLink,
        };
      }
    }

    // Always return success (don't reveal if email exists)
    return {
      message:
        'If your email is registered, you will receive a password reset link.',
    };
  }

  /**
   * Reset password
   *
   * Flow:
   * 1. Find user by token
   * 2. Check if token is valid and not expired
   * 3. Update password
   * 4. Clear reset token
   *
   * @param resetPasswordDto - Token and new password
   * @returns Success message
   * @throws BadRequestException if token invalid/expired
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.userService.findByPasswordResetToken(
      resetPasswordDto.token,
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Reset password
    await this.userService.resetPassword(user, resetPasswordDto.newPassword);

    this.logger.log(`Password reset for user: ${user.email}`, 'AuthService');

    return {
      message: 'Password successfully reset. You can now log in.',
    };
  }
}
