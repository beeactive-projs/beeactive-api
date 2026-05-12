import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  subheading,
} from '../_layouts/base-layout';

/**
 * Public-facing acknowledgement when someone joins the pre-launch
 * waitlist from the marketing site. Keep the tone light — these are
 * cold leads, not active users.
 */
export function waitlistConfirmationTemplate(name?: string): string {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';

  const content = `
    ${eyebrow("YOU'RE ON THE LIST", 'confirmation')}
    ${heading("You're on the list! &#127881;")}
    ${subheading('Thanks for your interest in MotionHive')}
    ${paragraph(`${greeting} we're thrilled that you want to be part of the MotionHive community.`)}
    ${paragraph("We're working hard to build a platform that makes fitness more accessible, social, and fun. You'll be among the <strong>first to know</strong> when we launch.")}
    ${calloutBox('info', "<strong>What happens next?</strong> We'll send you an invite as soon as early access opens. Stay tuned!")}
    ${divider()}
    ${paragraph('In the meantime, follow us for updates and sneak peeks.')}
  `;

  return baseLayout(content, {
    preheader: "You're on the MotionHive waitlist!",
    footerNote:
      "You're receiving this because you signed up for the MotionHive waitlist.",
    category: 'confirmation',
  });
}

export function waitlistConfirmationTemplateText(name?: string): string {
  const greeting = name ? `Hi ${name},` : 'Hi there,';

  return plainTextLayout({
    preheader: "You're on the MotionHive waitlist!",
    footerNote:
      "You're receiving this because you signed up for the MotionHive waitlist.",
    sections: [
      {
        heading: "You're on the list",
        body: [
          `${greeting} we're thrilled that you want to be part of the MotionHive community.`,
          "We're working hard to build a platform that makes fitness more accessible, social, and fun. You'll be among the first to know when we launch.",
          "What happens next? We'll send you an invite as soon as early access opens. Stay tuned!",
        ],
      },
      {
        body: ['In the meantime, follow us for updates and sneak peeks.'],
      },
    ],
  });
}
