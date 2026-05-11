import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  primaryButton,
} from '../_layouts/base-layout';

/**
 * Generic notification email used by NotificationService when a
 * notification is delivered through the email channel.
 *
 * Renders the same `title` + `body` we store on the in-app row, plus
 * an optional CTA derived from `data.screen` so the user can click
 * through to the relevant app surface.
 *
 * Specialized notification types can register their own templates
 * later — this is the fallback so a producer never has to define a
 * template just to enable email delivery.
 */
export function genericNotificationTemplate(params: {
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body);
  const cta =
    params.ctaUrl && params.ctaLabel
      ? primaryButton(escapeHtml(params.ctaLabel), params.ctaUrl)
      : '';

  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${heading(safeTitle)}
    ${paragraph(safeBody)}
    ${cta}
  `;

  return baseLayout(content, {
    preheader: safeTitle,
    category: 'update',
  });
}

export function genericNotificationTemplateText(params: {
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  return plainTextLayout({
    preheader: params.title,
    sections: [
      {
        heading: params.title,
        body: [params.body],
        ...(params.ctaUrl && params.ctaLabel
          ? { ctas: [{ label: params.ctaLabel, url: params.ctaUrl }] }
          : {}),
      },
    ],
  });
}
