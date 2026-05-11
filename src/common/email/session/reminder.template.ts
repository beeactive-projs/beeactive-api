import { escapeHtml } from '../../utils/html.utils';
import {
  baseLayout,
  dateTimeBlock,
  eyebrow,
  heading,
  paragraph,
  personCard,
  plainTextLayout,
  subheading,
} from '../_layouts/base-layout';

/**
 * Pre-session reminder.
 *
 * NOT WIRED UP YET — the scheduler that would dispatch this lives in
 * the future jobs module. See `project_jobs_module_pending.md`. The
 * template ships so the design system is consistent and so the jobs
 * worker, once built, only needs to call this with the existing
 * signature.
 *
 * TODO [jobs-module]: emit this template from a scheduled reminder
 * worker N hours before `session.scheduled_at`. When wiring it up:
 *   - Add `sendSessionReminderEmail` to `EmailService`.
 *   - Consider passing `date` and `time` as separate strings so the
 *     `dateTimeBlock` can render them on separate lines. Today the
 *     full `scheduledAt` is passed in as `date` and `time` is left
 *     empty, which works but reads as one chunky string.
 */
export function sessionReminderTemplate(
  participantName: string,
  sessionTitle: string,
  instructorName: string,
  scheduledAt: string,
  location: string,
): string {
  const safeParticipant = escapeHtml(participantName);
  const safeTitle = escapeHtml(sessionTitle);
  const safeScheduled = escapeHtml(scheduledAt);
  const safeLocation = escapeHtml(location);

  const content = `
    ${eyebrow('REMINDER', 'time')}
    ${heading('Session reminder')}
    ${subheading(`Don't forget — ${safeTitle} is coming up`)}
    ${dateTimeBlock({
      date: safeScheduled,
      time: '',
      location: safeLocation,
    })}
    ${paragraph(`Hi ${safeParticipant}, get ready for your upcoming session.`)}
    ${personCard({ name: instructorName, role: 'Your instructor' })}
  `;

  return baseLayout(content, {
    preheader: `Reminder: "${safeTitle}" is coming up`,
    category: 'time',
  });
}

export function sessionReminderTemplateText(
  participantName: string,
  sessionTitle: string,
  instructorName: string,
  scheduledAt: string,
  location: string,
): string {
  return plainTextLayout({
    preheader: `Reminder: "${sessionTitle}" is coming up`,
    sections: [
      {
        heading: 'Session reminder',
        body: [
          `Hi ${participantName}, get ready for your upcoming session.`,
          `Session: ${sessionTitle}`,
        ],
        details: [
          { label: 'When', value: scheduledAt },
          { label: 'Where', value: location },
          { label: 'Instructor', value: instructorName },
        ],
      },
    ],
  });
}
