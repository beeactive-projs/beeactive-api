import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  dataCard,
  dataRow,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  subheading,
} from '../_layouts/base-layout';

/**
 * Acknowledgement of a feedback submission. Sent only to the address
 * the submitter typed (NOT looked up from a `userId` — that vector
 * was removed for security; see `FeedbackService.create`).
 */
export function feedbackConfirmationTemplate(
  type: string,
  title: string,
  name?: string,
): string {
  const safeTitle = escapeHtml(title);
  const safeType = escapeHtml(type);
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const safeTypeLabel = escapeHtml(`Your ${typeLabel}`);

  const content = `
    ${eyebrow('FEEDBACK RECEIVED', 'confirmation')}
    ${heading('Feedback received &#9989;')}
    ${subheading('We appreciate you taking the time to write to us')}
    ${paragraph(`${greeting} thank you for your ${safeType}. Every piece of feedback helps us build a better platform.`)}
    ${dataCard(dataRow(safeTypeLabel, safeTitle))}
    ${paragraph("Our team reviews every submission. While we can't respond to each one individually, your input directly shapes what we build next.")}
    ${divider()}
    ${paragraph('Thanks for helping us improve MotionHive!')}
  `;

  return baseLayout(content, {
    preheader: 'Thanks for your feedback!',
    footerNote:
      "You're receiving this because you submitted feedback on MotionHive.",
    category: 'confirmation',
  });
}

export function feedbackConfirmationTemplateText(
  type: string,
  title: string,
  name?: string,
): string {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  return plainTextLayout({
    preheader: 'Thanks for your feedback!',
    footerNote:
      "You're receiving this because you submitted feedback on MotionHive.",
    sections: [
      {
        heading: 'Feedback received',
        body: [
          `${greeting} thank you for your ${type}. Every piece of feedback helps us build a better platform.`,
        ],
        details: [{ label: `Your ${typeLabel}`, value: title }],
      },
      {
        body: [
          "Our team reviews every submission. While we can't respond to each one individually, your input directly shapes what we build next.",
          'Thanks for helping us improve MotionHive!',
        ],
      },
    ],
  });
}
