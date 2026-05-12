import {
  baseLayout,
  eyebrow,
  expiryNote,
  heading,
  paragraph,
  plainTextLayout,
  primaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Fired by `POST /auth/forgot-password`. The link contains a
 * single-use token (1h TTL) generated server-side; nothing about the
 * user's password is leaked here.
 */
export function passwordResetTemplate(resetLink: string): string {
  const content = `
    ${eyebrow('ACTION REQUIRED', 'action')}
    ${heading('Reset your password')}
    ${subheading('We received a password reset request')}
    ${paragraph("Click the button below to choose a new password. If you didn't make this request, you can safely ignore this email — your password won't change.")}
    ${primaryButton('&#128273; Reset password', resetLink)}
    ${expiryNote('This reset link expires in <strong>1 hour</strong> and can only be used once.')}
    ${securityNote("If you didn't request a password reset, someone may have entered your email by mistake. No changes have been made to your account.")}
  `;

  return baseLayout(content, {
    preheader: 'Reset your MotionHive password',
    category: 'action',
  });
}

export function passwordResetTemplateText(resetLink: string): string {
  return plainTextLayout({
    preheader: 'Reset your MotionHive password',
    sections: [
      {
        heading: 'Reset your password',
        body: [
          "We received a password reset request. Click the link below to choose a new password. If you didn't make this request, you can safely ignore this email — your password won't change.",
        ],
        ctas: [{ label: 'Reset password', url: resetLink }],
      },
      {
        body: [
          'This reset link expires in 1 hour and can only be used once.',
          "If you didn't request a password reset, someone may have entered your email by mistake. No changes have been made to your account.",
        ],
      },
    ],
  });
}
