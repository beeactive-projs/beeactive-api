import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  divider,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  primaryButton,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to both parties when group ownership is transferred. The
 * `direction` flag selects the right copy ("you handed over" vs
 * "you received") so the same template serves both recipients —
 * same pattern as `collaboration-ended.template.ts`.
 *
 * Categorised differently per direction: the new owner is a
 * 'confirmation' (something good is yours now); the old owner is
 * an 'update' (informational, neutral).
 */
export function groupOwnershipTransferredTemplate(params: {
  direction: 'received' | 'transferred';
  recipientFirstName: string | null;
  otherPartyName: string;
  groupName: string;
  groupLink: string;
}): string {
  const {
    direction,
    recipientFirstName,
    otherPartyName,
    groupName,
    groupLink,
  } = params;
  const safeFirst = escapeHtml(recipientFirstName);
  const safeOther = escapeHtml(otherPartyName);
  const safeGroup = escapeHtml(groupName);
  const greeting = recipientFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  const eyebrowLabel =
    direction === 'received'
      ? 'YOU ARE THE NEW OWNER'
      : 'OWNERSHIP TRANSFERRED';
  const category = direction === 'received' ? 'confirmation' : 'update';
  const headline =
    direction === 'received'
      ? `You're now the owner of ${safeGroup}`
      : `You transferred ${safeGroup}`;
  const sub =
    direction === 'received'
      ? `${safeOther} handed the group over to you`
      : `${safeOther} is now the owner`;
  const body =
    direction === 'received'
      ? `<strong>${safeOther}</strong> transferred ownership of <strong>${safeGroup}</strong> to you. You now have full control over members, settings, sessions and posts.`
      : `You transferred ownership of <strong>${safeGroup}</strong> to <strong>${safeOther}</strong>. You remain a member of the group, but ${safeOther} now controls members, settings, sessions and posts.`;
  const personRole = direction === 'received' ? 'Previous owner' : 'New owner';

  const cta =
    direction === 'received'
      ? primaryButton('Manage your group', groupLink)
      : secondaryButton('Open group', groupLink);

  const content = `
    ${eyebrow(eyebrowLabel, category)}
    ${paragraph(greeting)}
    ${heading(headline)}
    ${subheading(sub)}
    ${personCard({ name: otherPartyName, role: personRole })}
    ${paragraph(body)}
    ${cta}
    ${divider()}
    ${paragraph(
      direction === 'received'
        ? 'You can always transfer ownership again later from the group settings.'
        : 'Thanks for keeping the group active. You can always rejoin a leadership role by being invited back as an owner.',
    )}
  `;

  return baseLayout(content, {
    preheader:
      direction === 'received'
        ? `${otherPartyName} transferred ${groupName} to you`
        : `You transferred ownership of ${groupName} to ${otherPartyName}`,
    category,
  });
}

export function groupOwnershipTransferredTemplateText(params: {
  direction: 'received' | 'transferred';
  recipientFirstName: string | null;
  otherPartyName: string;
  groupName: string;
  groupLink: string;
}): string {
  const {
    direction,
    recipientFirstName,
    otherPartyName,
    groupName,
    groupLink,
  } = params;
  const greeting = recipientFirstName
    ? `Hi ${recipientFirstName},`
    : 'Hi there,';
  const headline =
    direction === 'received'
      ? `You're now the owner of ${groupName}`
      : `You transferred ${groupName}`;
  const body =
    direction === 'received'
      ? `${otherPartyName} transferred ownership of ${groupName} to you. You now have full control over members, settings, sessions and posts.`
      : `You transferred ownership of ${groupName} to ${otherPartyName}. You remain a member of the group, but ${otherPartyName} now controls members, settings, sessions and posts.`;
  return plainTextLayout({
    preheader:
      direction === 'received'
        ? `${otherPartyName} transferred ${groupName} to you`
        : `You transferred ownership of ${groupName} to ${otherPartyName}`,
    sections: [
      {
        heading: headline,
        body: [greeting, body],
        ctas: [
          {
            label:
              direction === 'received' ? 'Manage your group' : 'Open group',
            url: groupLink,
          },
        ],
      },
      {
        body: [
          direction === 'received'
            ? 'You can always transfer ownership again later from the group settings.'
            : 'Thanks for keeping the group active. You can always rejoin a leadership role by being invited back as an owner.',
        ],
      },
    ],
  });
}
