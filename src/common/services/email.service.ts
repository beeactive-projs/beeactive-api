import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Resend } from 'resend';
import {
  emailVerificationTemplate,
  welcomeTemplate,
  passwordResetTemplate,
  invitationTemplate,
  sessionCancelledTemplate,
} from './email-templates';

/**
 * Email Service
 *
 * Sends branded emails via Resend (https://resend.com).
 * Falls back to console logging when RESEND_API_KEY is not set.
 *
 * All email methods follow the same pattern:
 * - Build branded HTML from templates
 * - Send via Resend (or log in dev when no API key)
 * - Never throw on failure — email errors shouldn't break the main flow
 */
@Injectable()
export class EmailService {
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;
  private readonly apiUrl: string;
  private readonly isProduction: boolean;
  private readonly resend: Resend | null;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {
    this.fromEmail =
      this.configService.get('EMAIL_FROM') || 'noreply@beeactive.fit';
    this.fromName =
      this.configService.get('EMAIL_FROM_NAME') || 'BeeActive';
    this.frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
    this.isProduction =
      this.configService.get('NODE_ENV') === 'production';

    // In dev, email links point to the API for direct verification
    const port = this.configService.get('PORT') || 3000;
    this.apiUrl = `http://localhost:${port}`;

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

  /**
   * Get the base URL for email links.
   * In dev: points to API directly (http://localhost:PORT)
   * In prod: points to frontend (FRONTEND_URL)
   */
  private getBaseUrl(): string {
    return this.isProduction ? this.frontendUrl : this.apiUrl;
  }

  // =====================================================
  // AUTH EMAILS
  // =====================================================

  /**
   * Send email verification email
   */
  async sendEmailVerification(
    email: string,
    verificationToken: string,
  ): Promise<void> {
    // In dev: link goes to API GET endpoint directly
    // In prod: link goes to frontend which calls the API
    const verifyLink = this.isProduction
      ? `${this.frontendUrl}/verify-email?token=${verificationToken}`
      : `${this.apiUrl}/auth/verify-email?token=${verificationToken}`;

    const subject = 'Verify your BeeActive email';
    const html = emailVerificationTemplate(verifyLink);

    await this.send(email, subject, html);
  }

  /**
   * Send welcome email (called after email verification, not on registration)
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const subject = 'Welcome to BeeActive!';
    const html = welcomeTemplate(firstName, this.frontendUrl);

    await this.send(email, subject, html);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const resetLink = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    const subject = 'Reset your BeeActive password';
    const html = passwordResetTemplate(resetLink);

    await this.send(email, subject, html);
  }

  // =====================================================
  // INVITATION EMAILS
  // =====================================================

  /**
   * Send organization invitation email
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
    const html = invitationTemplate(
      inviterName,
      organizationName,
      acceptLink,
      message,
    );

    await this.send(email, subject, html);
  }

  // =====================================================
  // SESSION NOTIFICATION EMAILS
  // =====================================================

  /**
   * Send session cancellation notification to a participant
   */
  async sendSessionCancelledEmail(
    email: string,
    participantName: string,
    sessionTitle: string,
    organizerName: string,
    scheduledAt: Date,
  ): Promise<void> {
    const formattedDate = scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const subject = `Session "${sessionTitle}" has been cancelled`;
    const html = sessionCancelledTemplate(
      participantName,
      sessionTitle,
      organizerName,
      formattedDate,
    );

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
