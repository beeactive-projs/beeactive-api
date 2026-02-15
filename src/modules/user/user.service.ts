import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { User } from './entities/user.entity';
import {
  SocialAccount,
  SocialProvider,
} from './entities/social-account.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CryptoService } from '../../common/services';

export interface OAuthProfile {
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * User Service
 *
 * Handles all business logic related to users:
 * - Creating users
 * - Finding users
 * - Password validation
 * - Account lockout
 * - Token generation for password reset/email verification
 *
 * This is the "brain" of the user module.
 * Controllers call these methods, services interact with the database.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
    @InjectModel(SocialAccount)
    private socialAccountModel: typeof SocialAccount,
    private configService: ConfigService,
    private cryptoService: CryptoService,
  ) {}

  /**
   * Find user by email
   *
   * @param email - User's email address
   * @returns User object or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({
      where: { email },
    });
  }

  /**
   * Find user by ID
   *
   * @param id - User's UUID
   * @returns User object or null if not found
   */
  async findById(id: string): Promise<User | null> {
    return this.userModel.findByPk(id);
  }

  /**
   * Create a new user
   *
   * Steps:
   * 1. Check if email is already taken
   * 2. Hash password with bcrypt
   * 3. Create user in database
   *
   * @param userData - User registration data
   * @returns Created user object
   * @throws ConflictException if email already exists
   */
  async create(
    userData: CreateUserDto,
    transaction?: Transaction,
  ): Promise<User> {
    // Check if user already exists (do this BEFORE expensive bcrypt operation)
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // ✅ SECURITY FIX: Increased bcrypt rounds from 10 to 12
    // More rounds = more secure but slower (12 is good balance)
    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 12;
    const hashedPassword = await bcrypt.hash(userData.password, bcryptRounds);

    // Create user
    const user = await this.userModel.create(
      {
        email: userData.email,
        passwordHash: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
      },
      { transaction },
    );

    return user;
  }

  /**
   * Find or create user from OAuth provider (Google, Facebook).
   * - If social account exists: return linked user.
   * - If user exists by email: link social account (account linking), return user.
   * - Otherwise: create user (no password) + social account, return user.
   *
   * @param provider - GOOGLE | FACEBOOK | APPLE
   * @param profile - Email, name, provider user id
   * @param transaction - Optional transaction
   * @returns { user, isNewUser } - isNewUser true only when user was just created
   */
  async findOrCreateFromOAuth(
    provider: SocialProvider,
    profile: OAuthProfile,
    transaction?: Transaction,
  ): Promise<{ user: User; isNewUser: boolean }> {
    // 1. Already linked?
    const existingSocial = await this.socialAccountModel.findOne({
      where: { provider, providerUserId: profile.providerUserId },
      include: [{ model: User, as: 'user' }],
      transaction,
    });
    if (existingSocial?.user) {
      return { user: existingSocial.user as User, isNewUser: false };
    }

    // 2. User exists by email? Link social account.
    const existingUser = await this.findByEmail(profile.email);
    if (existingUser) {
      await this.socialAccountModel.create(
        {
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
          providerEmail: profile.email,
        },
        { transaction },
      );
      return { user: existingUser, isNewUser: false };
    }

    // 3. Create new user + social account
    const user = await this.createFromOAuth(profile, transaction);
    await this.socialAccountModel.create(
      {
        userId: user.id,
        provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
      },
      { transaction },
    );
    return { user, isNewUser: true };
  }

  /**
   * Create user from OAuth profile (no password).
   * OAuth users are treated as email-verified.
   */
  async createFromOAuth(
    profile: OAuthProfile,
    transaction?: Transaction,
  ): Promise<User> {
    const existingUser = await this.findByEmail(profile.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    return this.userModel.create(
      {
        email: profile.email,
        passwordHash: null,
        firstName: profile.firstName,
        lastName: profile.lastName,
        isEmailVerified: true,
      },
      { transaction },
    );
  }

  /**
   * Update user profile fields
   *
   * @param userId - User's UUID
   * @param dto - Fields to update
   * @returns Updated user
   */
  async updateUser(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }
    await user.update(dto);
    return user;
  }

  /**
   * Soft-delete user account (GDPR)
   *
   * Sets deletedAt timestamp. The user record is preserved but
   * inaccessible through normal queries (paranoid mode).
   *
   * @param userId - User's UUID
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new ConflictException('User not found');
    }
    user.isActive = false;
    await user.save();
    await user.destroy(); // Soft delete (paranoid: true)
  }

  /**
   * Validate user's password
   *
   * Uses bcrypt.compare() which:
   * - Extracts salt from stored hash
   * - Hashes provided password with same salt
   * - Compares results (timing-safe comparison)
   *
   * @param user - User object from database
   * @param password - Plain password to check
   * @returns True if password matches
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false; // OAuth-only user has no password
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Check if user account is locked
   *
   * Account is locked if:
   * - locked_until is set AND
   * - locked_until is in the future
   *
   * @param user - User object
   * @returns True if account is currently locked
   */
  isAccountLocked(user: User): boolean {
    if (!user.lockedUntil) return false;
    return new Date() < user.lockedUntil;
  }

  /**
   * Increment failed login attempts
   *
   * After 5 failed attempts, lock account for 15 minutes.
   *
   * @param user - User object
   */
  async incrementFailedAttempts(user: User): Promise<void> {
    const MAX_ATTEMPTS = 5;
    const LOCK_DURATION_MINUTES = 15;

    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
      // Lock the account
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCK_DURATION_MINUTES);
      user.lockedUntil = lockedUntil;
    }

    await user.save();
  }

  /**
   * Reset failed login attempts
   *
   * Called after successful login.
   *
   * @param user - User object
   */
  async resetFailedAttempts(user: User): Promise<void> {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();
  }

  /**
   * Generate email verification token
   *
   * Creates a secure token, hashes it, and stores hash in database.
   * Returns plain token to send to user via email.
   * Token is valid for 24 hours.
   *
   * @param user - User object
   * @param transaction - Optional Sequelize transaction
   * @returns Plain token (to send in email)
   */
  async generateEmailVerificationToken(
    user: User,
    transaction?: Transaction,
  ): Promise<string> {
    const { token, hashedToken, expiresAt } =
      this.cryptoService.generateTokenWithExpiry(24); // 24 hour validity

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = expiresAt;
    await user.save({ transaction });

    return token; // Return plain token to send via email
  }

  /**
   * Find user by email verification token
   *
   * @param token - Plain token from email link
   * @returns User object or null if token invalid/expired
   */
  async findByEmailVerificationToken(token: string): Promise<User | null> {
    const hashedToken = this.cryptoService.hashToken(token);

    const user = await this.userModel.findOne({
      where: {
        emailVerificationToken: hashedToken,
      },
    });

    // Check if token is expired
    if (user && user.emailVerificationExpires) {
      if (new Date() > user.emailVerificationExpires) {
        return null; // Token expired
      }
    }

    return user;
  }

  /**
   * Mark user email as verified
   *
   * @param user - User object
   */
  async markEmailVerified(user: User): Promise<void> {
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();
  }

  /**
   * Generate password reset token
   *
   * Creates a secure token, hashes it, and stores hash in database.
   * Returns plain token to send to user via email.
   *
   * @param user - User object
   * @returns Plain token (to send in email)
   */
  async generatePasswordResetToken(user: User): Promise<string> {
    const { token, hashedToken, expiresAt } =
      this.cryptoService.generateTokenWithExpiry(1); // 1 hour validity

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = expiresAt;
    await user.save();

    return token; // Return plain token to send via email
  }

  /**
   * Find user by password reset token
   *
   * @param token - Plain token from email link
   * @returns User object or null if token invalid/expired
   */
  async findByPasswordResetToken(token: string): Promise<User | null> {
    const hashedToken = this.cryptoService.hashToken(token);

    const user = await this.userModel.findOne({
      where: {
        passwordResetToken: hashedToken,
      },
    });

    // Check if token is expired
    if (user && user.passwordResetExpires) {
      if (new Date() > user.passwordResetExpires) {
        return null; // Token expired
      }
    }

    return user;
  }

  /**
   * Reset user password
   *
   * @param user - User object
   * @param newPassword - New plain password
   */
  async resetPassword(user: User, newPassword: string): Promise<void> {
    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 12;
    user.passwordHash = await bcrypt.hash(newPassword, bcryptRounds);

    // Clear reset token
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();
  }
}
