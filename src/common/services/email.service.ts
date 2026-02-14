import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

/**
 * Email Service
 *
 * Foundation for sending emails throughout the application.
 * Currently logs emails to console instead of sending them.
 *
 * To integrate a real provider:
 * 1. Install the provider SDK (e.g., npm install @sendgrid/mail or resend)
 * 2. Add API key to .env (e.g., SENDGRID_API_KEY or RESEND_API_KEY)
 * 3. Replace the log-only implementations below with actual sends
 *
 * All email methods follow the same pattern:
 * - Build the email content
 * - Send via provider (or log in dev)
 * - Return success/failure
 */
@Injectable()
export class EmailService {
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;
  private readonly isProduction: boolean;

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
    this.isProduction =
      this.configService.get('NODE_ENV') === 'production';
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
  // NOTIFICATION EMAILS (future)
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
  // CORE SEND METHOD
  // =====================================================

  /**
   * Send an email
   *
   * Currently logs to console. Replace this method body with your
   * email provider integration:
   *
   * SendGrid:
   *   const sgMail = require('@sendgrid/mail');
   *   sgMail.setApiKey(this.configService.get('SENDGRID_API_KEY'));
   *   await sgMail.send({ to, from, subject, html });
   *
   * Resend:
   *   const resend = new Resend(this.configService.get('RESEND_API_KEY'));
   *   await resend.emails.send({ from, to, subject, html });
   *
   * AWS SES:
   *   const ses = new SESClient({ region: 'eu-west-1' });
   *   await ses.send(new SendEmailCommand({ ... }));
   */
  private async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    // TODO: Replace with real email provider when ready
    // For now, log the email details
    this.logger.log(
      `[EMAIL] To: ${to} | Subject: ${subject} | From: ${this.fromName} <${this.fromEmail}>`,
      'EmailService',
    );

    if (!this.isProduction) {
      // In development, log the full HTML for debugging
      this.logger.debug?.(
        `[EMAIL HTML] ${html.substring(0, 200)}...`,
        'EmailService',
      );
    }

    // When you integrate a provider, add error handling:
    // try {
    //   await provider.send({ to, from: `${this.fromName} <${this.fromEmail}>`, subject, html });
    //   this.logger.log(`Email sent to ${to}: ${subject}`, 'EmailService');
    // } catch (error) {
    //   this.logger.error(`Failed to send email to ${to}: ${error.message}`, 'EmailService');
    //   // Don't throw — email failure shouldn't break the main flow
    // }
  }
}
