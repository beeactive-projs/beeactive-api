import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Resend } from 'resend';

/**
 * Email Service
 *
 * Sends emails via Resend (https://resend.com).
 * Falls back to console logging when RESEND_API_KEY is not set.
 *
 * All email methods follow the same pattern:
 * - Build the email content (subject + HTML)
 * - Send via Resend (or log in dev when no API key)
 * - Never throw on failure — email errors shouldn't break the main flow
 */
@Injectable()
export class EmailService {
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;
  private readonly resend: Resend | null;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.fromEmail =
      this.configService.get('EMAIL_FROM') || 'noreply@beeactive.com';
    this.fromName =
      this.configService.get('EMAIL_FROM_NAME') || 'BeeActive';
    this.frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:4200';

    // Initialize Resend if API key is available
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
      this.logger.log('Resend email provider initialized', 'EmailService');
    } else {
      this.resend = null;
      this.logger.warn(
        'RESEND_API_KEY not set — emails will be logged to console only',
        'EmailService',
      );
    }
  }

  // =====================================================
  // AUTH EMAILS
  // =====================================================

  /**
   * Send password reset email
   *
   * @param email - Recipient email
   * @param resetToken - Plain reset token (NOT the hashed one)
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const resetLink = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    const subject = 'Reset your BeeActive password';
    const html = `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetLink}" style="padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
      <p>This link will expire in <strong>1 hour</strong>.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">BeeActive - Fitness Platform</p>
    `.trim();

    await this.send(email, subject, html);
  }

  /**
   * Send email verification email
   *
   * @param email - Recipient email
   * @param verificationToken - Plain verification token
   */
  async sendEmailVerification(
    email: string,
    verificationToken: string,
  ): Promise<void> {
    const verifyLink = `${this.frontendUrl}/verify-email?token=${verificationToken}`;

    const subject = 'Verify your BeeActive email';
    const html = `
      <h2>Welcome to BeeActive!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyLink}" style="padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a></p>
      <p>This link will expire in <strong>24 hours</strong>.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">BeeActive - Fitness Platform</p>
    `.trim();

    await this.send(email, subject, html);
  }

  // =====================================================
  // INVITATION EMAILS
  // =====================================================

  /**
   * Send organization invitation email
   *
   * @param email - Invitee email
   * @param invitationToken - Plain invitation token
   * @param inviterName - Name of the person sending the invitation
   * @param organizationName - Name of the organization
   * @param message - Optional personal message from inviter
   */
  async sendInvitationEmail(
    email: string,
    invitationToken: string,
    inviterName: string,
    organizationName: string,
    message?: string,
  ): Promise<void> {
    const acceptLink = `${this.frontendUrl}/accept-invitation?token=${invitationToken}`;

    const subject = `You're invited to join ${organizationName} on BeeActive`;
    const html = `
      <h2>You've Been Invited!</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on BeeActive.</p>
      ${message ? `<blockquote style="border-left: 3px solid #f59e0b; padding-left: 12px; color: #555;">"${message}"</blockquote>` : ''}
      <p><a href="${acceptLink}" style="padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a></p>
      <p>This invitation will expire in <strong>7 days</strong>.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">BeeActive - Fitness Platform</p>
    `.trim();

    await this.send(email, subject, html);
  }

  // =====================================================
  // NOTIFICATION EMAILS
  // =====================================================

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const subject = 'Welcome to BeeActive!';
    const html = `
      <h2>Welcome, ${firstName}!</h2>
      <p>Thanks for joining BeeActive. Start your fitness journey today!</p>
      <p><a href="${this.frontendUrl}" style="padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">Get Started</a></p>
      <hr />
      <p style="color: #666; font-size: 12px;">BeeActive - Fitness Platform</p>
    `.trim();

    await this.send(email, subject, html);
  }

  // =====================================================
  // CORE SEND METHOD (Resend Integration)
  // =====================================================

  /**
   * Send an email via Resend
   *
   * Falls back to console logging if RESEND_API_KEY is not configured.
   * Never throws — email failure should not break the main application flow.
   */
  private async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const from = `${this.fromName} <${this.fromEmail}>`;

    if (this.resend) {
      try {
        const { data, error } = await this.resend.emails.send({
          from,
          to: [to],
          subject,
          html,
        });

        if (error) {
          this.logger.error(
            `Failed to send email to ${to}: ${error.message}`,
            'EmailService',
          );
          return;
        }

        this.logger.log(
          `Email sent to ${to} | Subject: "${subject}" | ID: ${data?.id}`,
          'EmailService',
        );
      } catch (error) {
        this.logger.error(
          `Failed to send email to ${to}: ${(error as Error).message}`,
          'EmailService',
        );
        // Don't throw — email failure shouldn't break the main flow
      }
    } else {
      // No Resend API key — log email to console for development
      this.logger.log(
        `[EMAIL - DEV MODE] To: ${to} | Subject: ${subject} | From: ${from}`,
        'EmailService',
      );
      this.logger.debug?.(
        `[EMAIL HTML] ${html.substring(0, 200)}...`,
        'EmailService',
      );
    }
  }
}
