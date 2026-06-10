import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
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
 * Friend-invite email. Sent when a MotionHive user shares the app
 * with someone they know via the home-page "Invite a friend" dialog.
 *
 * The recipient is NOT being invited to be the inviter's client —
 * just to join the platform. Sign-up link carries `?ref=<userId>`
 * so the future attribution flow can credit the inviter once the
 * BE picks up the field.
 */
export function friendInviteTemplate(params: {
  inviterName: string;
  signUpLink: string;
  personalMessage?: string;
}): string {
  const { inviterName, signUpLink, personalMessage } = params;
  const safeInviter = escapeHtml(inviterName);
  const safeMessage = escapeHtml(personalMessage);

  const content = `
    ${eyebrow('INVITATION', 'action')}
    ${heading('Come train with me on MotionHive')}
    ${subheading(`${safeInviter} thinks you'd like it here`)}
    ${personCard({ name: inviterName, role: 'Sent you an invite' })}
    ${paragraph(`<strong>${safeInviter}</strong> uses MotionHive to find coaches, book sessions, and track workouts. They thought you might enjoy it too.`)}
    ${personalMessage ? calloutBox('info', `<em>"${safeMessage}"</em>`) : ''}
    ${primaryButton('Join MotionHive', signUpLink)}
    ${securityNote("If you didn't expect this email, you can safely ignore it.")}
  `;

  return baseLayout(content, {
    preheader: `${inviterName} invited you to MotionHive`,
    category: 'action',
  });
}

export function friendInviteTemplateText(params: {
  inviterName: string;
  signUpLink: string;
  personalMessage?: string;
}): string {
  const { inviterName, signUpLink, personalMessage } = params;
  return plainTextLayout({
    preheader: `${inviterName} invited you to MotionHive`,
    sections: [
      {
        heading: 'Come train with me on MotionHive',
        body: [
          `${inviterName} uses MotionHive to find coaches, book sessions, and track workouts. They thought you might enjoy it too.`,
          ...(personalMessage ? [`Message: "${personalMessage}"`] : []),
        ],
        ctas: [{ label: 'Join MotionHive', url: signUpLink }],
      },
      {
        body: ["If you didn't expect this email, you can safely ignore it."],
      },
    ],
  });
}
