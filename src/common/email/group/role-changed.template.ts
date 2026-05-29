import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  chip,
  type ChipTone,
  dataCard,
  dataRow,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  secondaryButton,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to a member when their role in a group changes (promoted to
 * moderator or demoted back to member). Owner role isn't possible
 * via this path — that's the transfer-ownership flow.
 */
export function groupRoleChangedTemplate(params: {
  memberFirstName: string | null;
  groupName: string;
  oldRoleLabel: string;
  newRoleLabel: string;
  groupLink: string;
}): string {
  const { memberFirstName, groupName, oldRoleLabel, newRoleLabel, groupLink } =
    params;
  const safeFirst = escapeHtml(memberFirstName);
  const safeGroup = escapeHtml(groupName);
  const safeOld = escapeHtml(oldRoleLabel);
  const safeNew = escapeHtml(newRoleLabel);
  const greeting = memberFirstName ? `Hi ${safeFirst},` : 'Hi there,';

  // Highlight moderator promotions with a brand-honey chip; demote
  // back to plain member is neutral.
  const newTone: ChipTone =
    newRoleLabel.toLowerCase() === 'moderator' ? 'honey' : 'neutral';

  const content = `
    ${eyebrow('ROLE UPDATED', 'update')}
    ${paragraph(greeting)}
    ${heading('Your role changed')}
    ${subheading(`Your role in ${safeGroup} was updated`)}
    ${dataCard(
      dataRow('Group', safeGroup) +
        dataRow('Was', chip(safeOld, 'neutral')) +
        dataRow('Now', chip(safeNew, newTone)),
    )}
    ${paragraph(`The group owner updated your role in <strong>${safeGroup}</strong>.`)}
    ${secondaryButton('Open group', groupLink)}
  `;

  return baseLayout(content, {
    preheader: `Your role in ${groupName} changed to ${newRoleLabel}`,
    category: 'update',
  });
}

export function groupRoleChangedTemplateText(params: {
  memberFirstName: string | null;
  groupName: string;
  oldRoleLabel: string;
  newRoleLabel: string;
  groupLink: string;
}): string {
  const { memberFirstName, groupName, oldRoleLabel, newRoleLabel, groupLink } =
    params;
  const greeting = memberFirstName ? `Hi ${memberFirstName},` : 'Hi there,';
  return plainTextLayout({
    preheader: `Your role in ${groupName} changed to ${newRoleLabel}`,
    sections: [
      {
        heading: 'Your role changed',
        body: [greeting, `The group owner updated your role in ${groupName}.`],
        details: [
          { label: 'Group', value: groupName },
          { label: 'Was', value: oldRoleLabel },
          { label: 'Now', value: newRoleLabel },
        ],
        ctas: [{ label: 'Open group', url: groupLink }],
      },
    ],
  });
}
