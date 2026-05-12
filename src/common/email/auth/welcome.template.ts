import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  divider,
  eyebrow,
  featureItem,
  heading,
  paragraph,
  plainTextLayout,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Fired after the user verifies their email — NOT on sign-up. Drops
 * them into the app with a quick orientation of what they can do.
 *
 * `featureItem` is intentionally retained here (deprecated elsewhere)
 * because the iconed list is part of this template's voice.
 */
export function welcomeTemplate(
  firstName: string,
  frontendUrl: string,
): string {
  const safeFirstName = escapeHtml(firstName);
  const content = `
    ${eyebrow('WELCOME', 'confirmation')}
    ${heading(`Welcome, ${safeFirstName}! &#9889;`)}
    ${subheading("You're all set to start your journey towards a healthier and more active lifestyle")}
    ${paragraph("Your MotionHive account is ready. Here's what you can do:")}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${featureItem('&#127947;', '<strong>Join sessions</strong> — Find and participate in sessions that match your goals and preferences')}
      ${featureItem('&#129309;', '<strong>Connect with professionals</strong> — Get personalized guidance')}
      ${featureItem('&#127942;', '<strong>Organize your own events and sessions</strong> — Create sessions and build your community')}
    </table>

    ${secondaryButton('Open MotionHive', frontendUrl)}
    ${divider()}
    ${paragraph("Need help? Just reply to this email — we're happy to assist.")}
  `;

  return baseLayout(content, {
    preheader: `Welcome to MotionHive, ${safeFirstName}!`,
    category: 'confirmation',
  });
}

export function welcomeTemplateText(
  firstName: string,
  frontendUrl: string,
): string {
  return plainTextLayout({
    preheader: `Welcome to MotionHive, ${firstName}!`,
    sections: [
      {
        heading: `Welcome, ${firstName}!`,
        body: [
          "You're all set to start your journey towards a healthier and more active lifestyle.",
          "Your MotionHive account is ready. Here's what you can do:",
          '- Join sessions — Find and participate in sessions that match your goals and preferences',
          '- Connect with professionals — Get personalized guidance',
          '- Organize your own events and sessions — Create sessions and build your community',
        ],
        ctas: [{ label: 'Open MotionHive', url: frontendUrl }],
      },
      {
        body: ["Need help? Just reply to this email — we're happy to assist."],
      },
    ],
  });
}
