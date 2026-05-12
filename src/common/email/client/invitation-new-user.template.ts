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
 * Client invitation to a recipient who does NOT yet have a MotionHive
 * account. Sign-up link carries an opt-in token; once the recipient
 * registers, `acceptByToken` auto-accepts the invitation. Without a
 * token they can still sign up via the generic referral path.
 */
export function clientInvitationNewUserTemplate(params: {
  instructorName: string;
  signUpLink: string;
  message?: string;
}): string {
  const { instructorName, signUpLink, message } = params;
  const safeInstructor = escapeHtml(instructorName);
  const safeMessage = escapeHtml(message);

  const content = `
    ${eyebrow('INVITATION', 'action')}
    ${heading("You've been invited!")}
    ${subheading(`${safeInstructor} wants you to join MotionHive as their client`)}
    ${personCard({ name: instructorName, role: 'Coach' })}
    ${paragraph(`<strong>${safeInstructor}</strong> would like you to join MotionHive as their client.`)}
    ${message ? calloutBox('info', `<em>"${safeMessage}"</em>`) : ''}
    ${primaryButton('Join MotionHive', signUpLink)}
    ${securityNote('If you already have an account, just log in and the invitation will be waiting for you.')}
  `;

  return baseLayout(content, {
    preheader: `${instructorName} invited you to MotionHive`,
    category: 'action',
  });
}

export function clientInvitationNewUserTemplateText(params: {
  instructorName: string;
  signUpLink: string;
  message?: string;
}): string {
  const { instructorName, signUpLink, message } = params;
  return plainTextLayout({
    preheader: `${instructorName} invited you to MotionHive`,
    sections: [
      {
        heading: "You've been invited",
        body: [
          `${instructorName} would like you to join MotionHive as their client.`,
          ...(message ? [`Message: "${message}"`] : []),
        ],
        ctas: [{ label: 'Join MotionHive', url: signUpLink }],
      },
      {
        body: [
          'If you already have an account, just log in and the invitation will be waiting for you.',
        ],
      },
    ],
  });
}
