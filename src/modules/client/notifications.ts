import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';

/**
 * Notification builders for the client (instructor↔client) module.
 *
 * Click targets:
 *   - Pending requests live at /coaching/pending-requests (instructor)
 *     and /profile (client; has no dedicated page).
 *   - Active relationships are visible from the instructor's clients
 *     page (/coaching/clients) and the client's profile (/profile).
 */

/** Instructor — a user has requested to be coached by them. */
export function clientRequestReceived(
  instructorId: string,
  requesterName: string | null,
): NotifyParams {
  const who = requesterName ?? 'A user';
  return {
    userId: instructorId,
    type: NotificationType.CLIENT_REQUEST_RECEIVED,
    title: 'New coaching request',
    body: `${who} would like to work with you.`,
    data: { screen: 'coaching/pending-requests' },
  };
}

/** Requester — instructor accepted them as a client. */
export function clientRequestAccepted(
  requesterId: string,
  instructorName: string | null,
): NotifyParams {
  const who = instructorName ?? 'Your instructor';
  return {
    userId: requesterId,
    type: NotificationType.CLIENT_REQUEST_ACCEPTED,
    title: 'Coaching request accepted',
    body: `${who} accepted your coaching request.`,
    data: { screen: 'profile', queryParams: { tab: 'coaches' } },
  };
}

/** Requester — instructor declined their request. */
export function clientRequestDeclined(
  requesterId: string,
  instructorName: string | null,
): NotifyParams {
  const who = instructorName ?? 'The instructor';
  return {
    userId: requesterId,
    type: NotificationType.CLIENT_REQUEST_DECLINED,
    title: 'Coaching request declined',
    body: `${who} declined your coaching request.`,
    // Land on coaches tab so they can find another instructor.
    data: { screen: 'profile', queryParams: { tab: 'coaches' } },
  };
}

/** Invitee — instructor invited them to be a client. */
export function clientInvitationReceived(
  inviteeId: string,
  instructorName: string | null,
): NotifyParams {
  const who = inviteeName(instructorName);
  return {
    userId: inviteeId,
    type: NotificationType.CLIENT_INVITATION_RECEIVED,
    title: 'Coaching invitation',
    body: `${who} invited you to become their client.`,
    data: { screen: 'profile', queryParams: { tab: 'coaches' } },
  };
}

/** Instructor — client ended the coaching relationship. */
export function clientRelationshipEndedForInstructor(
  instructorId: string,
  clientName: string | null,
): NotifyParams {
  const who = clientName ?? 'A client';
  return {
    userId: instructorId,
    type: NotificationType.CLIENT_RELATIONSHIP_ENDED,
    title: 'Coaching ended',
    body: `${who} ended the coaching relationship.`,
    data: { screen: 'coaching/clients' },
  };
}

function inviteeName(name: string | null): string {
  return name ?? 'An instructor';
}
