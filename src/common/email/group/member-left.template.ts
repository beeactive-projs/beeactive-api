import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to a group owner when one of their members leaves the group
 * voluntarily (`POST /groups/:id/leave`). Matter-of-fact tone — not
 * every departure is a loss, and we don't want to make the owner
 * feel bad about routine churn.
 */
export function groupMemberLeftTemplate(params: {
  ownerFirstName: string | null;
  memberName: string;
  groupName: string;
  groupLink: string;
}): string {
  const { ownerFirstName, memberName, groupName, groupLink } = params;
  const safeFirst = escapeHtml(ownerFirstName);
  const safeMember = escapeHtml(memberName);
  const safeGroup = escapeHtml(groupName);
  const greeting = ownerFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${paragraph(greeting)}
    ${heading('A member left your group')}
    ${subheading(`${safeMember} is no longer in ${safeGroup}`)}
    ${personCard({ name: memberName, role: `Was a member of ${groupName}` })}
    ${paragraph(`<strong>${safeMember}</strong> left <strong>${safeGroup}</strong>. Their data and posts remain visible to current members; only their access has been revoked.`)}
    ${secondaryButton('Open group', groupLink)}
  `;

  return baseLayout(content, {
    preheader: `${memberName} left ${groupName}`,
    category: 'update',
  });
}

export function groupMemberLeftTemplateText(params: {
  ownerFirstName: string | null;
  memberName: string;
  groupName: string;
  groupLink: string;
}): string {
  const { ownerFirstName, memberName, groupName, groupLink } = params;
  const greeting = ownerFirstName ? `Hi ${ownerFirstName},` : 'Hi there,';
  return plainTextLayout({
    preheader: `${memberName} left ${groupName}`,
    sections: [
      {
        heading: 'A member left your group',
        body: [
          greeting,
          `${memberName} left ${groupName}. Their data and posts remain visible to current members; only their access has been revoked.`,
        ],
        ctas: [{ label: 'Open group', url: groupLink }],
      },
    ],
  });
}
