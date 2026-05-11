import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  calloutBox,
  dataCard,
  dataRow,
  divider,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  subheading,
} from '../_layouts/base-layout';

/**
 * Sent to every active participant when an instructor reschedules a
 * session. Shows old → new in a single card so the diff is obvious;
 * if the instructor supplied a `reason`, it surfaces as an info
 * callout below.
 *
 * No CTA today — the FE session detail page lives behind auth and
 * the canonical URL pattern includes a session id we don't currently
 * thread through `EmailService`. When the jobs module adds the
 * deeper integration it can also pass a `sessionLink` here.
 */
export function sessionRescheduledTemplate(params: {
  participantName: string;
  sessionTitle: string;
  instructorName: string;
  oldScheduledAtLabel: string;
  newScheduledAtLabel: string;
  reason?: string;
}): string {
  const {
    participantName,
    sessionTitle,
    instructorName,
    oldScheduledAtLabel,
    newScheduledAtLabel,
    reason,
  } = params;
  const safeParticipant = escapeHtml(participantName);
  const safeTitle = escapeHtml(sessionTitle);
  const safeInstructor = escapeHtml(instructorName);
  const safeOld = escapeHtml(oldScheduledAtLabel);
  const safeNew = escapeHtml(newScheduledAtLabel);
  const safeReason = escapeHtml(reason);

  const content = `
    ${eyebrow('RESCHEDULED', 'time')}
    ${heading('Session rescheduled')}
    ${subheading(`${safeTitle} has been moved to a new time`)}
    ${dataCard(
      dataRow('Session', safeTitle) +
        dataRow('Was', `<s style="color:#94a3b8;">${safeOld}</s>`) +
        dataRow('Now', `<strong>${safeNew}</strong>`),
    )}
    ${paragraph(`Hi ${safeParticipant}, the instructor has moved this session to a new time.`)}
    ${reason ? calloutBox('info', `<strong>Reason:</strong> ${safeReason}`) : ''}
    ${personCard({ name: instructorName, role: 'Your instructor' })}
    ${divider()}
    ${paragraph("If the new time doesn't work for you, you can leave the session from the app — your spot will free up for someone else.")}
  `;

  return baseLayout(content, {
    preheader: `"${sessionTitle}" rescheduled — now ${newScheduledAtLabel}`,
    category: 'time',
  });
}

export function sessionRescheduledTemplateText(params: {
  participantName: string;
  sessionTitle: string;
  instructorName: string;
  oldScheduledAtLabel: string;
  newScheduledAtLabel: string;
  reason?: string;
}): string {
  const {
    participantName,
    sessionTitle,
    instructorName,
    oldScheduledAtLabel,
    newScheduledAtLabel,
    reason,
  } = params;
  return plainTextLayout({
    preheader: `"${sessionTitle}" rescheduled — now ${newScheduledAtLabel}`,
    sections: [
      {
        heading: 'Session rescheduled',
        body: [
          `Hi ${participantName}, the instructor has moved this session to a new time.`,
          ...(reason ? [`Reason: ${reason}`] : []),
        ],
        details: [
          { label: 'Session', value: sessionTitle },
          { label: 'Was', value: oldScheduledAtLabel },
          { label: 'Now', value: newScheduledAtLabel },
          { label: 'Instructor', value: instructorName },
        ],
      },
      {
        body: [
          "If the new time doesn't work for you, you can leave the session from the app — your spot will free up for someone else.",
        ],
      },
    ],
  });
}
