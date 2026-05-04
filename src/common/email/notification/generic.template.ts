import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  heading,
  paragraph,
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
    ${heading(safeTitle)}
    ${paragraph(safeBody)}
    ${cta}
  `;

  return baseLayout(content, safeTitle);
}
