import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';
import { formatSessionTime } from '../notification/format';

/**
 * Notification builders for the session module.
 *
 * Builders take **primitives** (id, name, Date) — never Sequelize entities.
 * Entities have lazy associations that explode when an outbox flushes
 * after commit. Callers are responsible for projecting the entity into
 * a `SessionRef`.
 *
 * Click targets:
 *   - Instructor screens live at /coaching/sessions/* (calendar, list, detail).
 *   - Client screens live at /sessions/* (discover, my, detail).
 *   - The detail page for a single occurrence is /sessions/instances/:id
 *     for both audiences (route guard differentiates).
 *
 * Defaults map (`notification-defaults.ts`):
 *   - reminders → in-app + email + push (24h) / in-app + push (1h)
 *   - cancel / reschedule → in-app + email + push
 *   - status changed / participant churn → in-app only
 */

export interface SessionRef {
  id: string; // instance id
  templateId: string;
  title: string;
  startAt: Date;
  timezone: string;
}

interface BookingResult {
  status:
    | 'CONFIRMED'
    | 'PENDING_APPROVAL'
    | 'WAITLISTED'
    | 'CANCELLED'
    | 'DECLINED';
}

// ─── To CLIENT (the person who booked) ────────────────────────────────

/** Booking outcome — confirmed, pending approval, or waitlisted. */
export function sessionBookedForUser(
  userId: string,
  session: SessionRef,
  result: BookingResult,
): NotifyParams {
  const when = formatSessionTime(session.startAt, session.timezone);
  const heading =
    result.status === 'CONFIRMED'
      ? 'Booking confirmed'
      : result.status === 'PENDING_APPROVAL'
        ? 'Booking pending approval'
        : 'Joined the waitlist';
  const tail =
    result.status === 'CONFIRMED'
      ? `You're in for "${session.title}" on ${when}.`
      : result.status === 'PENDING_APPROVAL'
        ? `Waiting for the instructor to approve your booking for "${session.title}" on ${when}.`
        : `"${session.title}" on ${when} is full — we'll let you know if a seat opens.`;
  return {
    userId,
    // Reuse the lifecycle SESSION_STATUS_CHANGED bucket — informational,
    // in-app only by default. The defaults map currently has no dedicated
    // "BOOKING_CONFIRMED" type; we collapse here to keep the type catalogue
    // stable until we have a clear reason to split.
    type: NotificationType.SESSION_STATUS_CHANGED,
    title: heading,
    body: tail,
    data: { screen: 'sessions', entityId: session.id },
  };
}

/** Client — instructor approved their pending booking. */
export function bookingApprovedForUser(
  userId: string,
  session: SessionRef,
): NotifyParams {
  const when = formatSessionTime(session.startAt, session.timezone);
  return {
    userId,
    type: NotificationType.SESSION_STATUS_CHANGED,
    title: 'Booking approved',
    body: `You're confirmed for "${session.title}" on ${when}.`,
    data: { screen: 'sessions', entityId: session.id },
  };
}

/** Client — instructor declined their pending booking. */
export function bookingDeclinedForUser(
  userId: string,
  session: SessionRef,
  reason: string | null,
): NotifyParams {
  const tail = reason ? ` Reason: ${reason}` : '';
  return {
    userId,
    type: NotificationType.SESSION_STATUS_CHANGED,
    title: 'Booking declined',
    body: `Your booking for "${session.title}" was not approved.${tail}`,
    data: { screen: 'my/sessions' },
  };
}

/** Client — they got auto-promoted off the waitlist into a seat. */
export function bookingPromotedForUser(
  userId: string,
  session: SessionRef,
): NotifyParams {
  const when = formatSessionTime(session.startAt, session.timezone);
  return {
    userId,
    type: NotificationType.SESSION_STATUS_CHANGED,
    title: "You're in!",
    body: `A seat opened up — you're now confirmed for "${session.title}" on ${when}.`,
    data: { screen: 'sessions', entityId: session.id },
  };
}

/** Client — the instructor cancelled the session they were booked into. */
export function sessionCancelledForUser(
  userId: string,
  session: SessionRef,
  reason: string | null,
  message: string | null,
): NotifyParams {
  const when = formatSessionTime(session.startAt, session.timezone);
  const tail = reason ? ` Reason: ${reason}.` : '';
  const note = message ? ` "${message}"` : '';
  return {
    userId,
    type: NotificationType.SESSION_CANCELLED,
    title: 'Session cancelled',
    body: `"${session.title}" on ${when} has been cancelled.${tail}${note}`,
    data: { screen: 'my/sessions', queryParams: { tab: 'cancelled' } },
  };
}

/** Client — the instructor rescheduled their session. */
export function sessionRescheduledForUser(
  userId: string,
  session: SessionRef,
  oldStartAt: Date,
): NotifyParams {
  const before = formatSessionTime(oldStartAt, session.timezone);
  const after = formatSessionTime(session.startAt, session.timezone);
  return {
    userId,
    type: NotificationType.SESSION_RESCHEDULED,
    title: 'Session rescheduled',
    body: `"${session.title}" moved from ${before} to ${after}.`,
    data: { screen: 'sessions', entityId: session.id },
  };
}

/** Client — generic 24h or 1h reminder before the session starts. */
export function sessionReminderForUser(
  userId: string,
  session: SessionRef,
  kind: 'REMINDER_24H' | 'REMINDER_1H',
): NotifyParams {
  const when = formatSessionTime(session.startAt, session.timezone);
  const heading =
    kind === 'REMINDER_24H' ? 'Session tomorrow' : 'Session starting soon';
  const tail =
    kind === 'REMINDER_24H'
      ? `"${session.title}" is on ${when}.`
      : `"${session.title}" starts in about an hour (${when}).`;
  return {
    userId,
    type:
      kind === 'REMINDER_24H'
        ? NotificationType.SESSION_REMINDER_24H
        : NotificationType.SESSION_REMINDER_1H,
    title: heading,
    body: tail,
    data: { screen: 'sessions', entityId: session.id },
  };
}

/** Client — instructor-sent follow-up message after the session ended. */
export function sessionFollowUpForUser(
  userId: string,
  session: SessionRef,
  message: string,
): NotifyParams {
  return {
    userId,
    // Dedicated channel — defaults to in-app + email (see
    // notification-defaults.ts). Users would expect to receive these
    // even if not opening the app the same day.
    type: NotificationType.SESSION_FOLLOW_UP,
    title: `Note from your instructor — ${session.title}`,
    body: message.length > 240 ? `${message.slice(0, 240)}…` : message,
    data: { screen: 'sessions', entityId: session.id },
  };
}

// ─── To INSTRUCTOR (audience = the session owner) ────────────────────

/** Instructor — a user booked into one of their sessions. */
export function participantJoinedForInstructor(
  instructorId: string,
  participantName: string | null,
  session: SessionRef,
): NotifyParams {
  const who = participantName ?? 'A user';
  return {
    userId: instructorId,
    type: NotificationType.PARTICIPANT_JOINED,
    title: 'New booking',
    body: `${who} booked into "${session.title}".`,
    data: { screen: 'coaching/sessions', entityId: session.id },
  };
}

/** Instructor — a user cancelled their booking. */
export function participantLeftForInstructor(
  instructorId: string,
  participantName: string | null,
  session: SessionRef,
): NotifyParams {
  const who = participantName ?? 'A user';
  return {
    userId: instructorId,
    type: NotificationType.PARTICIPANT_LEFT,
    title: 'Booking cancelled',
    body: `${who} cancelled their booking for "${session.title}".`,
    data: { screen: 'coaching/sessions', entityId: session.id },
  };
}
