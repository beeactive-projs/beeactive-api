import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  divider,
  eyebrow,
  heading,
  paragraph,
  plainTextLayout,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to every confirmed participant when an instructor cancels a
 * session. Worded with a small apology because cancellations are a
 * trust event — keep it short and don't pile on offers.
 */
export function sessionCancelledTemplate(
  participantName: string,
  sessionTitle: string,
  instructorName: string,
  scheduledAt: string,
): string {
  const safeParticipant = escapeHtml(participantName);
  const safeTitle = escapeHtml(sessionTitle);
  const safeInstructor = escapeHtml(instructorName);
  const safeScheduled = escapeHtml(scheduledAt);
  const content = `
    ${eyebrow('CANCELLED', 'time')}
    ${heading('Session cancelled')}
    ${subheading('A session you were registered for has been cancelled')}
    ${calloutBox(
      'error',
      `<strong>${safeTitle}</strong> &middot; ${safeScheduled} &middot; Instructor: ${safeInstructor}`,
    )}
    ${paragraph(`Hi ${safeParticipant}, the instructor has cancelled this session. We apologize for any inconvenience.`)}
    ${divider()}
    ${paragraph('You can browse other available sessions on the platform.')}
  `;

  return baseLayout(content, {
    preheader: `Session "${safeTitle}" has been cancelled`,
    category: 'time',
  });
}

export function sessionCancelledTemplateText(
  participantName: string,
  sessionTitle: string,
  instructorName: string,
  scheduledAt: string,
): string {
  return plainTextLayout({
    preheader: `Session "${sessionTitle}" has been cancelled`,
    sections: [
      {
        heading: 'Session cancelled',
        body: [
          `Hi ${participantName}, the instructor has cancelled this session. We apologize for any inconvenience.`,
        ],
        details: [
          { label: 'Session', value: sessionTitle },
          { label: 'Scheduled', value: scheduledAt },
          { label: 'Instructor', value: instructorName },
        ],
      },
      {
        body: ['You can browse other available sessions on the platform.'],
      },
    ],
  });
}
