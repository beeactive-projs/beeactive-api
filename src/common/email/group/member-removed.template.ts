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
 * Sent to a member when they're removed from a group by the owner.
 * Soft, non-accusatory tone — the recipient may not have expected it.
 * No back-link to the group itself (they no longer have access);
 * point them at the groups list so they can find a new home.
 */
export function groupMemberRemovedTemplate(params: {
  memberFirstName: string | null;
  groupName: string;
  groupsListLink: string;
}): string {
  const { memberFirstName, groupName, groupsListLink } = params;
  const safeFirst = escapeHtml(memberFirstName);
  const safeGroup = escapeHtml(groupName);
  const greeting = memberFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${paragraph(greeting)}
    ${heading('You were removed from a group')}
    ${subheading(`Your membership in ${safeGroup} ended`)}
    ${paragraph(`You've been removed from <strong>${safeGroup}</strong>. You no longer have access to its sessions, members or posts.`)}
    ${secondaryButton('Browse groups', groupsListLink)}
    ${securityNote('If you think this was a mistake, reach out to the group owner directly to sort it out.')}
  `;

  return baseLayout(content, {
    preheader: `You were removed from ${groupName}`,
    category: 'update',
  });
}

export function groupMemberRemovedTemplateText(params: {
  memberFirstName: string | null;
  groupName: string;
  groupsListLink: string;
}): string {
  const { memberFirstName, groupName, groupsListLink } = params;
  const greeting = memberFirstName ? `Hi ${memberFirstName},` : 'Hi there,';
  return plainTextLayout({
    preheader: `You were removed from ${groupName}`,
    sections: [
      {
        heading: 'You were removed from a group',
        body: [
          greeting,
          `You've been removed from ${groupName}. You no longer have access to its sessions, members or posts.`,
        ],
        ctas: [{ label: 'Browse groups', url: groupsListLink }],
      },
      {
        body: [
          'If you think this was a mistake, reach out to the group owner directly to sort it out.',
        ],
      },
    ],
  });
}
