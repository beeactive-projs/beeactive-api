import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  divider,
  expiryNote,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  primaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Group invitation — the inviter is sending someone (registered or
 * not) a link to join their group. The accept link carries a single-
 * use token; expires in 7 days.
 */
export function invitationTemplate(
  inviterName: string,
  groupName: string,
  acceptLink: string,
  message?: string,
): string {
  const safeInviter = escapeHtml(inviterName);
  const safeGroup = escapeHtml(groupName);
  const safeMessage = escapeHtml(message);
  const messageBlock = message
    ? calloutBox('info', `<em>"${safeMessage}"</em>`)
    : '';

  const content = `
    ${eyebrow('INVITATION', 'action')}
    ${heading("You're invited!")}
    ${subheading(`${safeInviter} wants you to join their team`)}
    ${personCard({ name: inviterName, role: 'Sent you an invitation' })}
    ${paragraph(`<strong>${safeInviter}</strong> has invited you to join <strong>${safeGroup}</strong> on MotionHive — a fitness platform for instructors and clients.`)}
    ${messageBlock}
    ${primaryButton('&#129309; Accept invitation', acceptLink)}
    ${divider()}
    ${paragraph(`By accepting, you'll be added as a member of <strong>${safeGroup}</strong> and can start joining training sessions.`)}
    ${expiryNote('This invitation expires in <strong>7 days</strong>.')}
    ${securityNote("If you don't know the person who sent this, you can safely ignore this email.")}
  `;

  return baseLayout(content, {
    preheader: `${safeInviter} invited you to join ${safeGroup}`,
    category: 'action',
  });
}

export function invitationTemplateText(
  inviterName: string,
  groupName: string,
  acceptLink: string,
  message?: string,
): string {
  const sections = [
    {
      heading: "You're invited",
      body: [
        `${inviterName} has invited you to join ${groupName} on MotionHive — a fitness platform for instructors and clients.`,
        ...(message ? [`Personal message: "${message}"`] : []),
      ],
      ctas: [{ label: 'Accept invitation', url: acceptLink }],
    },
    {
      body: [
        `By accepting, you'll be added as a member of ${groupName} and can start joining training sessions.`,
        'This invitation expires in 7 days.',
        "If you don't know the person who sent this, you can safely ignore this email.",
      ],
    },
  ];

  return plainTextLayout({
    preheader: `${inviterName} invited you to join ${groupName}`,
    sections,
  });
}
