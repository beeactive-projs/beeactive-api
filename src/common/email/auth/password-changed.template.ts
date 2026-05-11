import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  secondaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Security notification: the user's password was just changed on a
 * logged-in session (NOT via the forgot-password flow — that path
 * already self-confirms by emailing the reset link).
 *
 * If the change was the user themselves, this is reassurance.
 * If it wasn't, this is the alert that lets them recover via the
 * "Reset password" CTA before an attacker keeps the new credential.
 */
export function passwordChangedTemplate(params: {
  firstName: string | null;
  changedAtLabel: string;
  resetLink: string;
}): string {
  const { firstName, changedAtLabel, resetLink } = params;
  const safeFirst = escapeHtml(firstName);
  const safeChangedAt = escapeHtml(changedAtLabel);
  const greeting = firstName ? `Hi ${safeFirst},` : 'Hi there,';

  const content = `
    ${eyebrow('SECURITY', 'update')}
    ${heading('Your password was changed')}
    ${subheading('We noticed a password change on your account')}
    ${paragraph(`${greeting} your MotionHive password was changed on <strong>${safeChangedAt}</strong>. If this was you, no further action is needed — for safety we also signed you out on every other device.`)}
    ${paragraph("If you didn't make this change, your account may be compromised. Reset your password now to lock it down.")}
    ${secondaryButton('Reset password', resetLink)}
    ${securityNote("Need help? Reply to this email — we're happy to assist.")}
  `;

  return baseLayout(content, {
    preheader: 'Your MotionHive password was just changed',
    category: 'update',
  });
}

export function passwordChangedTemplateText(params: {
  firstName: string | null;
  changedAtLabel: string;
  resetLink: string;
}): string {
  const { firstName, changedAtLabel, resetLink } = params;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return plainTextLayout({
    preheader: 'Your MotionHive password was just changed',
    sections: [
      {
        heading: 'Your password was changed',
        body: [
          `${greeting} your MotionHive password was changed on ${changedAtLabel}. If this was you, no further action is needed — for safety we also signed you out on every other device.`,
          "If you didn't make this change, your account may be compromised. Reset your password now to lock it down.",
        ],
        ctas: [{ label: 'Reset password', url: resetLink }],
      },
      {
        body: ["Need help? Reply to this email — we're happy to assist."],
      },
    ],
  });
}
