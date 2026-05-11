import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  securityNote,
} from '../_layouts/base-layout';

/**
 * Tells the request sender their client request was declined.
 * Intentionally brief and non-punishing — soft language is a product
 * decision, not an oversight. No CTA.
 */
export function clientRequestDeclinedTemplate(params: {
  recipientFirstName: string | null;
  responderName: string;
}): string {
  const { recipientFirstName, responderName } = params;
  const safeFirst = escapeHtml(recipientFirstName);
  const safeResponder = escapeHtml(responderName);
  const greeting = recipientFirstName ? `Hi ${safeFirst},` : 'Hi,';

  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${paragraph(greeting)}
    ${heading('Request update')}
    ${paragraph(`<strong>${safeResponder}</strong> isn't able to take on your request at this time.`)}
    ${securityNote("You can explore other options on MotionHive whenever you're ready.")}
  `;

  return baseLayout(content, {
    preheader: 'Update on your request on MotionHive',
    category: 'update',
  });
}

export function clientRequestDeclinedTemplateText(params: {
  recipientFirstName: string | null;
  responderName: string;
}): string {
  const { recipientFirstName, responderName } = params;
  const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,';
  return plainTextLayout({
    preheader: 'Update on your request on MotionHive',
    sections: [
      {
        heading: 'Request update',
        body: [
          greeting,
          `${responderName} isn't able to take on your request at this time.`,
          "You can explore other options on MotionHive whenever you're ready.",
        ],
      },
    ],
  });
}
