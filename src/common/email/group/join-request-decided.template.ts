import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  secondaryButton,
  securityNote,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to the user who requested to join a group, once the owner
 * decides. The `decision` flag selects the right copy ("you're in"
 * vs "not this time") so one template serves both paths.
 *
 *  - APPROVED → 'confirmation' category, primary "Open group" CTA
 *  - REJECTED → 'update' category, no CTA, soft language
 */
export function groupJoinRequestDecidedTemplate(params: {
  decision: 'approved' | 'rejected';
  requesterFirstName: string | null;
  groupName: string;
  groupLink: string;
  groupsListLink: string;
}): string {
  const { decision, requesterFirstName, groupName, groupLink, groupsListLink } =
    params;
  const safeFirst = escapeHtml(requesterFirstName);
  const safeGroup = escapeHtml(groupName);
  const greeting = requesterFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  if (decision === 'approved') {
    const content = `
      ${eyebrow('REQUEST APPROVED', 'confirmation')}
      ${paragraph(greeting)}
      ${heading("You're in!")}
      ${subheading(`The owner approved your request to join ${safeGroup}`)}
      ${paragraph(`You're now a member of <strong>${safeGroup}</strong>. Jump in to see the latest posts, sessions and people.`)}
      ${secondaryButton('Open group', groupLink)}
      ${divider()}
      ${paragraph('Welcome aboard.')}
    `;
    return baseLayout(content, {
      preheader: `Your request to join ${groupName} was approved`,
      category: 'confirmation',
    });
  }

  // rejected
  const content = `
    ${eyebrow('UPDATE', 'update')}
    ${paragraph(greeting)}
    ${heading('Request update')}
    ${subheading(`The owner of ${safeGroup} couldn't add you this time`)}
    ${paragraph(`The owner of <strong>${safeGroup}</strong> declined your request to join. This isn't personal — sometimes groups are full, paused, or only accepting people they already know.`)}
    ${secondaryButton('Find another group', groupsListLink)}
    ${securityNote('You can request to join again later if the group opens up.')}
  `;
  return baseLayout(content, {
    preheader: `Update on your request to join ${groupName}`,
    category: 'update',
  });
}

export function groupJoinRequestDecidedTemplateText(params: {
  decision: 'approved' | 'rejected';
  requesterFirstName: string | null;
  groupName: string;
  groupLink: string;
  groupsListLink: string;
}): string {
  const { decision, requesterFirstName, groupName, groupLink, groupsListLink } =
    params;
  const greeting = requesterFirstName
    ? `Hi ${requesterFirstName},`
    : 'Hi there,';

  if (decision === 'approved') {
    return plainTextLayout({
      preheader: `Your request to join ${groupName} was approved`,
      sections: [
        {
          heading: "You're in",
          body: [
            greeting,
            `The owner approved your request to join ${groupName}. You're now a member.`,
            'Jump in to see the latest posts, sessions and people.',
          ],
          ctas: [{ label: 'Open group', url: groupLink }],
        },
        { body: ['Welcome aboard.'] },
      ],
    });
  }

  return plainTextLayout({
    preheader: `Update on your request to join ${groupName}`,
    sections: [
      {
        heading: 'Request update',
        body: [
          greeting,
          `The owner of ${groupName} declined your request to join. This isn't personal — sometimes groups are full, paused, or only accepting people they already know.`,
        ],
        ctas: [{ label: 'Find another group', url: groupsListLink }],
      },
      {
        body: ['You can request to join again later if the group opens up.'],
      },
    ],
  });
}
