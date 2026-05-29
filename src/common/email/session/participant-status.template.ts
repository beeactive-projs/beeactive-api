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
  subheading,
} from '../_layouts/base-layout';

/**
 * Fires when an instructor flips a participant's session status
 * (CONFIRMED / CANCELLED / ATTENDED / NO_SHOW). The label is
 * humanized for non-engineers; status names are an internal enum but
 * we still escape as defense-in-depth.
 */
export function participantStatusTemplate(
  participantName: string,
  sessionTitle: string,
  newStatus: string,
  scheduledAt: string,
): string {
  const safeParticipant = escapeHtml(participantName);
  const safeTitle = escapeHtml(sessionTitle);
  const safeScheduled = escapeHtml(scheduledAt);
  const statusLabels: Record<string, string> = {
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    ATTENDED: 'Attended',
    NO_SHOW: 'No-show',
  };
  const statusTones: Record<string, ChipTone> = {
    CONFIRMED: 'teal',
    CANCELLED: 'coral',
    ATTENDED: 'teal',
    NO_SHOW: 'neutral',
  };
  const statusLabel =
    statusLabels[newStatus] ||
    newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();
  const statusTone: ChipTone = statusTones[newStatus] || 'neutral';
  const statusBodyLabel = escapeHtml(statusLabel.toLowerCase());

  const content = `
    ${eyebrow('STATUS UPDATE', 'update')}
    ${heading('Session status update')}
    ${subheading('Your registration status has changed')}
    ${dataCard(
      dataRow('Session', safeTitle) +
        dataRow('Scheduled', safeScheduled) +
        dataRow('Status', chip(statusLabel, statusTone)),
    )}
    ${paragraph(`Hi ${safeParticipant}, your registration for this session has been ${statusBodyLabel} by the instructor.`)}
  `;

  return baseLayout(content, {
    preheader: 'Your session status has been updated',
    category: 'update',
  });
}

export function participantStatusTemplateText(
  participantName: string,
  sessionTitle: string,
  newStatus: string,
  scheduledAt: string,
): string {
  const statusLabels: Record<string, string> = {
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    ATTENDED: 'Attended',
    NO_SHOW: 'No-show',
  };
  const statusLabel =
    statusLabels[newStatus] ||
    newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();

  return plainTextLayout({
    preheader: 'Your session status has been updated',
    sections: [
      {
        heading: 'Session status update',
        body: [
          `Hi ${participantName}, your registration for this session has been ${statusLabel.toLowerCase()} by the instructor.`,
        ],
        details: [
          { label: 'Session', value: sessionTitle },
          { label: 'Scheduled', value: scheduledAt },
          { label: 'Status', value: statusLabel },
        ],
      },
    ],
  });
}
