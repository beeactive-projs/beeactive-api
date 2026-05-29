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
 * Sent right after sign-up so the user can verify their email and
 * unlock the rest of the platform. The link is single-use and
 * expires in 24h — the actual TTL lives in `UserService`.
 */
export function emailVerificationTemplate(verifyLink: string): string {
  const content = `
    ${eyebrow('ACTION REQUIRED', 'action')}
    ${heading('Verify your email')}
    ${subheading('One quick step to get started')}
    ${paragraph('Thanks for signing up for MotionHive! Please verify your email address to unlock all features and start your fitness journey.')}
    ${primaryButton('&#9989; Verify email address', verifyLink)}
    ${expiryNote('This verification link expires in <strong>24 hours</strong>.')}
    ${securityNote("If you didn't create a MotionHive account, you can safely ignore this email.")}
  `;

  return baseLayout(content, {
    preheader: 'Verify your email to get started with MotionHive',
    category: 'action',
  });
}

export function emailVerificationTemplateText(verifyLink: string): string {
  return plainTextLayout({
    preheader: 'Verify your email to get started with MotionHive',
    sections: [
      {
        heading: 'Verify your email',
        body: [
          'Thanks for signing up for MotionHive! Please verify your email address to unlock all features and start your fitness journey.',
        ],
        ctas: [{ label: 'Verify email address', url: verifyLink }],
      },
      {
        body: [
          'This verification link expires in 24 hours.',
          "If you didn't create a MotionHive account, you can safely ignore this email.",
        ],
      },
    ],
  });
}
