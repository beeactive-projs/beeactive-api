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

/** Requester — the other side accepted them.
 *
 *  Both directions share this builder because `acceptRequest` handles
 *  CLIENT_TO_INSTRUCTOR and INSTRUCTOR_TO_CLIENT with the same code
 *  path and always notifies request.fromUserId. But the click target
 *  differs by role: a client landing on their coaches tab, an
 *  instructor landing on their clients list.
 */
export function clientRequestAccepted(
  requesterId: string,
  responderName: string | null,
  requesterIsInstructor = false,
): NotifyParams {
  const who =
    responderName ?? (requesterIsInstructor ? 'A user' : 'Your instructor');
  return {
    userId: requesterId,
    type: NotificationType.CLIENT_REQUEST_ACCEPTED,
    title: requesterIsInstructor
      ? 'Invitation accepted'
      : 'Coaching request accepted',
    body: requesterIsInstructor
      ? `${who} accepted your invitation and is now your client.`
      : `${who} accepted your coaching request.`,
    data: requesterIsInstructor
      ? { screen: 'coaching/clients' }
      : { screen: 'profile', queryParams: { tab: 'coaches' } },
  };
}

/** Requester — the other side declined.
 *
 *  Same dual-recipient story as clientRequestAccepted — instructor
 *  invitations that get declined route back to the invite surface;
 *  client-side declined requests route to the coaches tab so they
 *  can look elsewhere.
 */
export function clientRequestDeclined(
  requesterId: string,
  responderName: string | null,
  requesterIsInstructor = false,
): NotifyParams {
  const who =
    responderName ?? (requesterIsInstructor ? 'The user' : 'The instructor');
  return {
    userId: requesterId,
    type: NotificationType.CLIENT_REQUEST_DECLINED,
    title: requesterIsInstructor
      ? 'Invitation declined'
      : 'Coaching request declined',
    body: requesterIsInstructor
      ? `${who} declined your coaching invitation.`
      : `${who} declined your coaching request.`,
    data: requesterIsInstructor
      ? { screen: 'coaching/clients' }
      : { screen: 'profile', queryParams: { tab: 'coaches' } },
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
