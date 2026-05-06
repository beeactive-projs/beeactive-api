import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';
import { GroupMemberRole } from './entities/group-member.entity';

/**
 * Notification builders for the group module.
 *
 * Click-target rule: the FE detail route is `/groups/:id` (not
 * `group-detail`), and the list is `/groups`. When the recipient is
 * still a member, we deep-link to the group; when they've been
 * removed, we send them to the list (no entityId) so they don't get
 * 403'd by the group's access guard.
 */

interface GroupRef {
  id: string;
  name: string | null;
}

/** Member was removed from the group — they no longer have access. */
export function groupMemberRemoved(
  removedUserId: string,
  group: GroupRef,
): NotifyParams {
  const where = group.name ? `"${group.name}"` : 'a group';
  return {
    userId: removedUserId,
    type: NotificationType.GROUP_MEMBER_REMOVED,
    title: 'Removed from group',
    body: `You've been removed from ${where}.`,
    // No entityId: the user can no longer access /groups/<id>. Land
    // on the list instead.
    data: { screen: 'groups' },
  };
}

/** Owner — someone requested to join their group. */
export function groupJoinRequestReceived(
  ownerId: string,
  group: GroupRef,
  requesterName: string | null,
): NotifyParams {
  const who = requesterName ?? 'Someone';
  const what = group.name ? ` "${group.name}"` : '';
  return {
    userId: ownerId,
    type: NotificationType.GROUP_JOIN_REQUEST_RECEIVED,
    title: 'New request to join your group',
    body: `${who} requested to join${what}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/** Requester — owner approved their join request. */
export function groupJoinRequestApproved(
  requesterId: string,
  group: GroupRef,
): NotifyParams {
  const where = group.name ? ` to "${group.name}"` : '';
  return {
    userId: requesterId,
    type: NotificationType.GROUP_JOIN_REQUEST_APPROVED,
    title: 'Join request approved',
    body: `You are now a member${where}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/** Requester — owner rejected their join request. */
export function groupJoinRequestRejected(
  requesterId: string,
  group: GroupRef,
): NotifyParams {
  const where = group.name ? ` to "${group.name}"` : '';
  return {
    userId: requesterId,
    type: NotificationType.GROUP_JOIN_REQUEST_REJECTED,
    title: 'Join request not approved',
    body: `The owner declined your request${where}.`,
    // The user isn't a member, so /groups/<id> may 403 depending on
    // visibility. Land them on the list.
    data: { screen: 'groups' },
  };
}

/** New owner — ownership was transferred to them. */
export function groupOwnershipTransferredToNewOwner(
  newOwnerId: string,
  group: GroupRef,
): NotifyParams {
  const what = group.name ? ` of "${group.name}"` : '';
  return {
    userId: newOwnerId,
    type: NotificationType.GROUP_OWNERSHIP_TRANSFERRED,
    title: 'You are now the group owner',
    body: `Ownership${what} was transferred to you.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/** Old owner — they handed ownership over. */
export function groupOwnershipTransferredFromOldOwner(
  oldOwnerId: string,
  group: GroupRef,
): NotifyParams {
  const what = group.name ? ` "${group.name}"` : '';
  return {
    userId: oldOwnerId,
    type: NotificationType.GROUP_OWNERSHIP_TRANSFERRED,
    title: 'Group ownership transferred',
    body: `You transferred ownership of${what}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/** Invitee — someone invited them to join a group. */
export function groupInvitationReceived(
  inviteeUserId: string,
  group: GroupRef,
  inviterName: string | null,
): NotifyParams {
  const who = inviterName ?? 'Someone';
  const what = group.name ? ` "${group.name}"` : ' a group';
  return {
    userId: inviteeUserId,
    type: NotificationType.GROUP_INVITATION_RECEIVED,
    title: 'You were invited to a group',
    body: `${who} invited you to join${what}.`,
    // No entityId until they accept — they may not yet have access.
    data: { screen: 'groups' },
  };
}

/** Owner — invitee accepted the invitation. */
export function groupInvitationAccepted(
  ownerId: string,
  group: GroupRef,
  inviteeName: string | null,
): NotifyParams {
  const who = inviteeName ?? 'A user';
  const what = group.name ? ` "${group.name}"` : ' your group';
  return {
    userId: ownerId,
    type: NotificationType.GROUP_INVITATION_ACCEPTED,
    title: 'Invitation accepted',
    body: `${who} accepted your invitation to${what}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/** Owner — invitee declined the invitation. */
export function groupInvitationDeclined(
  ownerId: string,
  group: GroupRef,
  inviteeName: string | null,
): NotifyParams {
  const who = inviteeName ?? 'A user';
  const what = group.name ? ` "${group.name}"` : ' your group';
  return {
    userId: ownerId,
    type: NotificationType.GROUP_INVITATION_DECLINED,
    title: 'Invitation declined',
    body: `${who} declined your invitation to${what}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

/**
 * Member — their role within the group changed. Accepts the
 * GroupMemberRole enum value (uppercase) and maps to a human label
 * locally so the body doesn't break if the enum string is ever
 * renamed (e.g. `"GROUP_MODERATOR"` → "your role is now a
 * group_moderator").
 */
export function groupMemberRoleChanged(
  memberUserId: string,
  group: GroupRef,
  newRole: GroupMemberRole,
): NotifyParams {
  const label = ROLE_LABELS[newRole] ?? 'member';
  const where = group.name ? ` in "${group.name}"` : '';
  return {
    userId: memberUserId,
    type: NotificationType.GROUP_MEMBER_ROLE_CHANGED,
    title: 'Your group role changed',
    body: `You are now a ${label}${where}.`,
    data: { screen: 'groups', entityId: group.id },
  };
}

const ROLE_LABELS: Record<GroupMemberRole, string> = {
  [GroupMemberRole.OWNER]: 'owner',
  [GroupMemberRole.MODERATOR]: 'moderator',
  [GroupMemberRole.MEMBER]: 'member',
};
