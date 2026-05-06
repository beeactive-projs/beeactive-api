import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';

/**
 * Notification builders for the post module.
 *
 * Click-target rule for posts: the FE has no standalone post detail
 * route — posts live inside the Posts tab of `/groups/:id`. So every
 * post notification deep-links to the group, not the post. This is
 * also defensive: a rejected post is hard-deleted, and a pending post
 * may be deleted before a moderator clicks. Sending the user to the
 * group avoids 404s without losing context (the body explains what
 * happened).
 */

interface PostContext {
  groupId: string;
  groupName: string | null;
  postId: string;
}

/**
 * Group staff (owner + moderators) — a member's post needs review.
 * One notification per recipient; the caller fans out via notifyMany.
 *
 * Returns `Omit<NotifyParams, 'userId'>` because the caller picks the
 * recipients.
 */
export function postPendingApproval(
  ctx: PostContext,
  authorName: string | null,
): Omit<NotifyParams, 'userId'> {
  const who = authorName ?? 'A member';
  const where = ctx.groupName ? ` "${ctx.groupName}"` : '';
  return {
    type: NotificationType.POST_PENDING_APPROVAL,
    title: 'A post needs your review',
    body: `${who} posted in${where} — review it from the group.`,
    data: { screen: 'groups', entityId: ctx.groupId },
  };
}

/** Author — moderator approved their post. */
export function postApprovedForAuthor(
  authorId: string,
  ctx: PostContext,
): NotifyParams {
  const where = ctx.groupName ? ` in "${ctx.groupName}"` : '';
  return {
    userId: authorId,
    type: NotificationType.POST_APPROVED,
    title: 'Your post was approved',
    body: `Your post${where} is now visible to the group.`,
    data: { screen: 'groups', entityId: ctx.groupId },
  };
}

/** Author — moderator rejected their post (post is deleted). */
export function postRejectedForAuthor(
  authorId: string,
  ctx: PostContext,
): NotifyParams {
  const where = ctx.groupName ? ` in "${ctx.groupName}"` : '';
  return {
    userId: authorId,
    type: NotificationType.POST_REJECTED,
    title: 'Your post was not approved',
    body: `A moderator removed your post${where}.`,
    // Land on the group, not the (now-deleted) post.
    data: { screen: 'groups', entityId: ctx.groupId },
  };
}

/** Author — someone commented on their post. */
export function postNewComment(
  authorId: string,
  ctx: PostContext,
  commenterName: string | null,
): NotifyParams {
  const who = commenterName ?? 'Someone';
  const where = ctx.groupName ? ` in "${ctx.groupName}"` : '';
  return {
    userId: authorId,
    type: NotificationType.POST_NEW_COMMENT,
    title: 'New comment on your post',
    body: `${who} commented on your post${where}.`,
    data: { screen: 'groups', entityId: ctx.groupId },
  };
}
