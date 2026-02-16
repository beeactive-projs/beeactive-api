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
import { OAuth2Client } from 'google-auth-library';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RoleService } from '../role/role.service';
import { ProfileService } from '../profile/profile.service';
import { Sequelize } from 'sequelize-typescript';
import { EmailService } from '../../common/services/email.service';

/** Return type of generateTokens; used for typing buildAuthResponse and responses */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** User shape returned by login/register (no secrets, with roles) */
export interface AuthUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  roles: string[];
}

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
    private emailService: EmailService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Register a new user
   *
   * Flow:
   * 1. Create user (password is hashed in UserService)
   * 2. Assign default 'USER' role
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
    // All DB operations share this transaction — if any fails, ALL are rolled back
    const transaction = await this.sequelize.transaction();

    try {
      // Create user (pass transaction so it's part of the atomic operation)
      const user = await this.userService.create(registerDto, transaction);

      // Assign default role
      await this.roleService.assignRoleToUserByName(
        user.id,
        'USER',
        undefined,
        undefined,
        transaction,
      );

      // Create empty participant profile (filled in later by user)
      await this.profileService.createUserProfile(user.id, transaction);

      // Generate email verification token (hashed, 24h expiry)
      const verificationToken =
        await this.userService.generateEmailVerificationToken(
          user,
          transaction,
        );

      // Commit transaction — all operations succeed together
      await transaction.commit();

      // Generate tokens
      const tokens = this.generateTokens(user.id, user.email);

      // Get user roles
      const roles = await this.roleService.getUserRoles(user?.id);
      const roleNames = roles.map((role) => role.name);

      this.logger.log(`User registered: ${user.email}`, 'AuthService');

      // Send verification email only (welcome email sent after verification)
      this.emailService
        .sendEmailVerification(user.email, verificationToken)
        .catch((err) =>
          this.logger.error(
            `Failed to send verification email: ${err.message}`,
            'AuthService',
          ),
        );

      return this.buildAuthResponse(user, tokens, roleNames);
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
      const lockedUntil = user.lockedUntil!.toLocaleString();
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
        `Failed login attempt for: ${user.email} (${user.failedLoginAttempts + 1} attempts)`,
        'AuthService',
      );

      throw new UnauthorizedException('Invalid credentials');
    }

    // Success! Reset failed attempts
    await this.userService.resetFailedAttempts(user);

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    // Get user roles
    const roles = await this.roleService.getUserRoles(user?.id);
    const roleNames = roles.map((role) => role.name);

    this.logger.log(`User logged in: ${user.email}`, 'AuthService');

    return this.buildAuthResponse(user, tokens, roleNames);
  }

  private buildAuthResponse(
    user: User,
    tokens: AuthTokens,
    roleNames: string[],
  ): AuthTokens & { user: AuthUserResponse } {
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        roles: roleNames,
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
  private generateTokens(userId: string, email: string): AuthTokens {
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
      if (!user || !user.isActive) {
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
      this.logger.error(`Invalid refresh token: ${error}`, 'AuthService');
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user
   *
   * Invalidates the provided refresh token by verifying it belongs
   * to the requesting user. Since refresh tokens are stateless JWTs,
   * the client is responsible for discarding the token after this call.
   *
   * @param refreshToken - The refresh token to invalidate
   * @param userId - The authenticated user's ID
   * @returns Success message
   */
  async logout(
    refreshToken: string,
    userId: string,
  ): Promise<{ message: string }> {
    try {
      // Verify the refresh token is valid and belongs to this user
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      if (payload.sub !== userId) {
        throw new UnauthorizedException(
          'Refresh token does not belong to this user',
        );
      }

      this.logger.log(`User logged out: ${userId}`, 'AuthService');

      return { message: 'Logged out successfully' };
    } catch (error) {
      // Even if token is invalid/expired, we consider logout successful
      // The important thing is the client discards the token
      this.logger.log(
        `User logout (token already invalid): ${userId}`,
        'AuthService',
      );
      return { message: 'Logged out successfully' };
    }
  }

  /**
   * Forgot password - Send reset email
   *
   * Flow:
   * 1. Find user by email
   * 2. Generate secure reset token
   * 3. Save hashed token in database
   * 4. Send password reset email (logs in dev, real email when provider is configured)
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

      // Send password reset email (currently logs, sends when provider configured)
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      this.logger.log(
        `Password reset requested for ${user.email}`,
        'AuthService',
      );

      // In development, return the reset link for testing convenience
      if (this.configService.get('NODE_ENV') !== 'production') {
        const frontendUrl =
          this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
        return {
          message:
            'If your email is registered, you will receive a password reset link.',
          resetLink,
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
   * Verify email address
   *
   * Flow:
   * 1. Hash the submitted token
   * 2. Find user by hashed token
   * 3. Check token expiration (24h)
   * 4. Mark email as verified
   * 5. Clear verification token
   *
   * @param verifyEmailDto - Token from email link
   * @returns Success message
   * @throws BadRequestException if token invalid/expired
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.userService.findByEmailVerificationToken(
      verifyEmailDto.token,
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.' };
    }

    await this.userService.markEmailVerified(user);

    this.logger.log(`Email verified for user: ${user.email}`, 'AuthService');

    // Send welcome email now that email is verified
    this.emailService
      .sendWelcomeEmail(user.email, user.firstName)
      .catch((err) =>
        this.logger.error(
          `Failed to send welcome email: ${err.message}`,
          'AuthService',
        ),
      );

    return {
      message: 'Email verified successfully. You can now use all features.',
    };
  }

  /**
   * Resend email verification
   *
   * Generates a new verification token and sends a new email.
   * Always returns success to prevent email enumeration.
   *
   * @param resendVerificationDto - Email address
   * @returns Success message
   */
  async resendVerification(resendVerificationDto: ResendVerificationDto) {
    const user = await this.userService.findByEmail(
      resendVerificationDto.email,
    );

    if (user && !user.isEmailVerified) {
      // Generate new verification token
      const verificationToken =
        await this.userService.generateEmailVerificationToken(user);

      // Send verification email
      await this.emailService.sendEmailVerification(
        user.email,
        verificationToken,
      );

      this.logger.log(
        `Verification email resent to: ${user.email}`,
        'AuthService',
      );
    }

    // Always return success (don't reveal if email exists or is already verified)
    return {
      message:
        'If your email is registered and not yet verified, a new verification link has been sent.',
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

  /**
   * Register or login with Google (token flow).
   * Verifies the ID token, then finds or creates user and returns JWT.
   */
  async registerWithGoogle(idToken: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Google Sign-In is not configured');
    }

    const client = new OAuth2Client(clientId);
    let payload: {
      sub: string;
      email?: string;
      given_name?: string;
      family_name?: string;
    } | null;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload() ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Google ID token verification failed: ${message}`,
        'AuthService',
      );
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const email = payload.email?.trim();
    if (!email) {
      throw new BadRequestException(
        'Google account has no email; email is required to sign in.',
      );
    }

    const profile = {
      providerUserId: payload.sub,
      email,
      firstName: payload.given_name?.trim() || 'User',
      lastName: payload.family_name?.trim() || '',
    };

    return this.handleOAuthSignIn('GOOGLE', profile);
  }

  /**
   * Register or login with Facebook (token flow).
   * Verifies the access token and fetches profile, then finds or creates user and returns JWT.
   */
  async registerWithFacebook(accessToken: string) {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException('Facebook Sign-In is not configured');
    }

    const appAccessToken = `${appId}|${appSecret}`;

    // Verify token and get user id
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
    let debugRes: Response;
    try {
      debugRes = await fetch(debugUrl);
    } catch (err) {
      this.logger.warn(`Facebook debug_token request failed: ${err}`);
      throw new UnauthorizedException('Invalid Facebook token');
    }

    const debugData = (await debugRes.json()) as {
      data?: { valid?: boolean; user_id?: string };
    };
    if (!debugData?.data?.valid || !debugData.data.user_id) {
      throw new UnauthorizedException('Invalid Facebook access token');
    }

    const userId = debugData.data.user_id;

    // Get profile (id, email, first_name, last_name)
    const meUrl = `https://graph.facebook.com/me?fields=id,email,first_name,last_name&access_token=${encodeURIComponent(accessToken)}`;
    let meRes: Response;
    try {
      meRes = await fetch(meUrl);
    } catch (err) {
      this.logger.warn(`Facebook me request failed: ${err}`);
      throw new UnauthorizedException('Invalid Facebook token');
    }

    const me = (await meRes.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      error?: { message: string };
    };
    if (me.error || !me.id) {
      throw new UnauthorizedException(
        me.error?.message || 'Could not load Facebook profile',
      );
    }

    const email = me.email?.trim();
    if (!email) {
      throw new BadRequestException(
        'Facebook account has no email or permission; email is required to sign in.',
      );
    }

    const profile = {
      providerUserId: me.id,
      email,
      firstName: me.first_name?.trim() || 'User',
      lastName: me.last_name?.trim() || '',
    };

    return this.handleOAuthSignIn('FACEBOOK', profile);
  }

  /**
   * Shared OAuth flow: find or create user, assign role/profile if new, return JWT + user.
   */
  private async handleOAuthSignIn(
    provider: 'GOOGLE' | 'FACEBOOK',
    profile: {
      providerUserId: string;
      email: string;
      firstName: string;
      lastName: string;
    },
  ) {
    const transaction = await this.sequelize.transaction();
    try {
      const { user, isNewUser } = await this.userService.findOrCreateFromOAuth(
        provider,
        profile,
        transaction,
      );

      if (isNewUser) {
        await this.roleService.assignRoleToUserByName(
          user.id,
          'USER',
          undefined,
          undefined,
          transaction,
        );
        await this.profileService.createUserProfile(user.id, transaction);
      }

      await transaction.commit();

      const tokens = this.generateTokens(user.id, user.email);
      const roles = await this.roleService.getUserRoles(user.id);
      const roleNames = roles.map((r) => r.name);

      this.logger.log(
        `User signed in with ${provider}: ${user.email}`,
        'AuthService',
      );

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          roles: roleNames,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
