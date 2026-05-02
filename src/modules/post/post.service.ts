import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { Post } from './entities/post.entity';
import {
  PostAudience,
  PostAudienceApproval,
  PostAudienceType,
} from './entities/post-audience.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostReaction } from './entities/post-reaction.entity';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { Group, MemberPostPolicy } from '../group/entities/group.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group/entities/group-member.entity';
import { User } from '../user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { DeletePostDto } from './dto/delete-post.dto';
import { ModerationDecision, ModeratePostDto } from './dto/moderate-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import {
  buildPaginatedResponse,
  getOffset,
  PaginatedResponse,
} from '../../common/dto/pagination.dto';
import { SearchIndexService } from '../search/search-index.service';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

/**
 * Tombstone written into post/comment `content` when the row is soft-deleted,
 * so the plaintext doesn't sit in the DB indefinitely. The row itself is kept
 * (paranoid: true) for audit; the body is gone.
 */
const DELETED_CONTENT_TOMBSTONE = '[deleted]';

export interface FeedItem {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  reactionCount: number;
  commentCount: number;
  myReaction: string | null;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  } | null;
  audiences?: PostAudience[];
}

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post) private readonly postModel: typeof Post,
    @InjectModel(PostAudience)
    private readonly audienceModel: typeof PostAudience,
    @InjectModel(PostComment)
    private readonly commentModel: typeof PostComment,
    @InjectModel(PostReaction)
    private readonly reactionModel: typeof PostReaction,
    @InjectModel(Group) private readonly groupModel: typeof Group,
    @InjectModel(GroupMember)
    private readonly memberModel: typeof GroupMember,
    private readonly searchIndexService: SearchIndexService,
    private readonly notificationService: NotificationService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =============================================================
  // CREATE
  // =============================================================

  async createPost(authorId: string, dto: CreatePostDto): Promise<FeedItem> {
    const uniqueGroupIds = Array.from(new Set(dto.groupIds));
    if (uniqueGroupIds.length !== dto.groupIds.length) {
      throw new BadRequestException('Duplicate groupIds in request');
    }

    if (dto.mediaUrls?.length) {
      this.cloudinaryService.assertOwnedUrls(dto.mediaUrls);
    }

    // Resolve groups + author memberships in one shot.
    const groups = await this.groupModel.findAll({
      where: { id: { [Op.in]: uniqueGroupIds } },
    });
    if (groups.length !== uniqueGroupIds.length) {
      throw new NotFoundException('One or more groups were not found');
    }

    const memberships = await this.memberModel.findAll({
      where: {
        groupId: { [Op.in]: uniqueGroupIds },
        userId: authorId,
        leftAt: null,
      },
    });
    const membershipByGroup = new Map(memberships.map((m) => [m.groupId, m]));

    // Per-group policy + role evaluation.
    type AudienceSpec = {
      groupId: string;
      approvalState: PostAudienceApproval;
    };
    const audienceSpecs: AudienceSpec[] = [];
    for (const group of groups) {
      const membership = membershipByGroup.get(group.id);
      if (!membership) {
        throw new ForbiddenException(
          `You are not an active member of group ${group.id}`,
        );
      }
      const isStaff =
        membership.role === GroupMemberRole.OWNER ||
        membership.role === GroupMemberRole.MODERATOR;

      if (isStaff) {
        audienceSpecs.push({
          groupId: group.id,
          approvalState: PostAudienceApproval.APPROVED,
        });
        continue;
      }

      if (group.memberPostPolicy === MemberPostPolicy.DISABLED) {
        throw new ForbiddenException(
          `Members are not allowed to post in group ${group.id}`,
        );
      }
      audienceSpecs.push({
        groupId: group.id,
        approvalState:
          group.memberPostPolicy === MemberPostPolicy.APPROVAL_REQUIRED
            ? PostAudienceApproval.PENDING
            : PostAudienceApproval.APPROVED,
      });
    }

    const sequelize = this.postModel.sequelize!;
    const tx = await sequelize.transaction();
    let createdPostId: string;
    try {
      const post = await this.postModel.create(
        {
          authorId,
          content: dto.content,
          mediaUrls: dto.mediaUrls ?? null,
        },
        { transaction: tx },
      );
      createdPostId = post.id;

      await this.audienceModel.bulkCreate(
        audienceSpecs.map((spec) => ({
          postId: post.id,
          audienceType: PostAudienceType.GROUP,
          audienceId: spec.groupId,
          approvalState: spec.approvalState,
        })),
        { transaction: tx },
      );

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    // After commit: search index + approval-flow notifications.
    // Failures here log but never roll back the user-visible write.
    await this.searchIndexService.upsertPost(createdPostId).catch((err) => {
      this.logger.error(
        `[posts] search index upsert failed for ${createdPostId}: ${(err as Error).message}`,
        'PostService',
      );
    });

    const pendingGroupIds = audienceSpecs
      .filter((s) => s.approvalState === PostAudienceApproval.PENDING)
      .map((s) => s.groupId);
    if (pendingGroupIds.length > 0) {
      await this.notifyPendingApproval(
        createdPostId,
        authorId,
        pendingGroupIds,
      );
    }

    return this.hydrateSingle(createdPostId, authorId);
  }

  // =============================================================
  // READ
  // =============================================================

  async getGroupFeed(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<FeedItem>> {
    await this.assertActiveMember(userId, groupId);
    return this.queryFeed(
      userId,
      groupId,
      PostAudienceApproval.APPROVED,
      page,
      limit,
    );
  }

  async getPendingForGroup(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<FeedItem>> {
    await this.assertGroupStaff(userId, groupId);
    return this.queryFeed(
      userId,
      groupId,
      PostAudienceApproval.PENDING,
      page,
      limit,
    );
  }

  async getComments(
    userId: string,
    postId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<PostComment>> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanViewPost(userId, postId);

    const offset = getOffset(page, limit);

    const { rows, count } = await this.commentModel.findAndCountAll({
      where: { postId, parentCommentId: null },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
        },
        {
          model: PostComment,
          as: 'replies',
          required: false,
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
            },
          ],
        },
      ],
      order: [
        ['createdAt', 'ASC'],
        [{ model: PostComment, as: 'replies' }, 'createdAt', 'ASC'],
      ],
      offset,
      limit,
    });

    return buildPaginatedResponse(rows, count, page, limit);
  }

  // =============================================================
  // UPDATE
  // =============================================================

  async updatePost(
    userId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<FeedItem> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this post');
    }
    if (dto.content === undefined && dto.mediaUrls === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    if (dto.mediaUrls?.length) {
      this.cloudinaryService.assertOwnedUrls(dto.mediaUrls);
    }

    const updates: Partial<Post> = {};
    if (dto.content !== undefined) updates.content = dto.content;
    if (dto.mediaUrls !== undefined) {
      updates.mediaUrls = dto.mediaUrls.length === 0 ? null : dto.mediaUrls;
    }

    // URLs that were on the post but aren't on the new list need their
    // Cloudinary assets purged so we don't leak storage on every edit.
    // Snapshot `previous` BEFORE the update — Sequelize mutates the
    // model instance in place when update() is awaited.
    const previousMedia = post.mediaUrls ?? [];

    await post.update(updates);

    if (dto.mediaUrls !== undefined) {
      const nextSet = new Set(dto.mediaUrls);
      const orphaned = previousMedia.filter((url) => !nextSet.has(url));
      await Promise.all(
        orphaned.map((url) => this.cloudinaryService.deleteByUrl(url)),
      );
    }

    await this.searchIndexService.upsertPost(postId).catch((err) => {
      this.logger.error(
        `[posts] search index upsert failed for ${postId}: ${(err as Error).message}`,
        'PostService',
      );
    });

    return this.hydrateSingle(postId, userId);
  }

  async moderatePost(
    userId: string,
    postId: string,
    groupId: string,
    dto: ModeratePostDto,
  ): Promise<void> {
    await this.assertGroupStaff(userId, groupId);

    const audience = await this.audienceModel.findOne({
      where: {
        postId,
        audienceType: PostAudienceType.GROUP,
        audienceId: groupId,
      },
    });
    if (!audience) {
      throw new NotFoundException('Audience entry not found for this group');
    }
    if (audience.approvalState !== PostAudienceApproval.PENDING) {
      throw new BadRequestException(
        `This audience entry is already ${audience.approvalState.toLowerCase()}`,
      );
    }

    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');

    const sequelize = this.postModel.sequelize!;
    const tx = await sequelize.transaction();
    try {
      if (dto.decision === ModerationDecision.APPROVED) {
        await audience.update(
          { approvalState: PostAudienceApproval.APPROVED },
          { transaction: tx },
        );
      } else {
        // Soft-delete the audience row; we leave approval_state as PENDING
        // because the row is now hidden by the deletedAt filter anyway.
        // The audit signal "this was rejected" lives in the deletedAt
        // timestamp + the moderator action log (see #11, future work).
        await audience.destroy({ transaction: tx });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    await this.searchIndexService.upsertPost(postId).catch(() => undefined);

    if (post.authorId !== userId) {
      await this.notificationService.notify({
        userId: post.authorId,
        type:
          dto.decision === ModerationDecision.APPROVED
            ? NotificationType.POST_APPROVED
            : NotificationType.POST_REJECTED,
        title:
          dto.decision === ModerationDecision.APPROVED
            ? 'Your post was approved'
            : 'Your post was not approved',
        body:
          dto.decision === ModerationDecision.APPROVED
            ? 'Your post is now visible to the group.'
            : 'A moderator removed your post from the group.',
        data: { screen: 'post-detail', entityId: postId },
      });
    }
  }

  // =============================================================
  // DELETE (selective)
  // =============================================================

  async deletePost(
    userId: string,
    postId: string,
    dto: DeletePostDto,
  ): Promise<{ post: 'kept' | 'deleted'; audiencesRemoved: number }> {
    // Bypass paranoid filter so we can detect "post row exists but already
    // soft-deleted" and short-circuit idempotently.
    const post = await this.postModel.findOne({
      where: { id: postId },
      paranoid: false,
    });
    if (!post) throw new NotFoundException('Post not found');

    // Truly already deleted — nothing to do, success is idempotent.
    if (post.deletedAt !== null) {
      return { post: 'deleted', audiencesRemoved: 0 };
    }

    const allAudiences = await this.audienceModel.findAll({
      where: { postId, audienceType: PostAudienceType.GROUP },
    });
    const activeAudiences = allAudiences.filter((a) => a.deletedAt === null);
    // Post is alive but has no active audiences (data drift, manual cleanup,
    // or a race). Fall through so we tombstone + destroy + purge assets,
    // not silently return success.
    if (activeAudiences.length === 0) {
      const mediaToDelete = post.mediaUrls ?? [];
      const sequelize = this.postModel.sequelize!;
      const tx = await sequelize.transaction();
      try {
        await this.destroyPostFully(post, tx);
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }

      await this.afterPostFullyDeleted(postId, mediaToDelete);
      return { post: 'deleted', audiencesRemoved: 0 };
    }

    const isAuthor = post.authorId === userId;

    // Resolve which audience rows the caller is allowed to remove.
    let targetAudiences: PostAudience[];
    if (isAuthor) {
      targetAudiences = dto.groupIds
        ? activeAudiences.filter((a) =>
            dto.groupIds!.includes(a.audienceId ?? ''),
          )
        : activeAudiences;
    } else {
      // Non-author: must be OWNER/MODERATOR of at least one audience group.
      const userMods = await this.memberModel.findAll({
        where: {
          userId,
          groupId: {
            [Op.in]: activeAudiences
              .map((a) => a.audienceId)
              .filter((id): id is string => id !== null),
          },
          role: { [Op.in]: [GroupMemberRole.OWNER, GroupMemberRole.MODERATOR] },
          leftAt: null,
        },
      });
      const moderatedGroupIds = new Set(userMods.map((m) => m.groupId));
      if (moderatedGroupIds.size === 0) {
        throw new ForbiddenException(
          'Only the author or a group moderator can delete this post',
        );
      }
      const requested = dto.groupIds
        ? new Set(dto.groupIds)
        : moderatedGroupIds;
      targetAudiences = activeAudiences.filter(
        (a) =>
          a.audienceId !== null &&
          moderatedGroupIds.has(a.audienceId) &&
          requested.has(a.audienceId),
      );
      if (targetAudiences.length === 0) {
        throw new ForbiddenException(
          'You are not a moderator of any of the targeted groups',
        );
      }
    }

    const targetIds = new Set(targetAudiences.map((a) => a.id));
    const remainingActive = activeAudiences.filter((a) => !targetIds.has(a.id));

    // Snapshot media URLs BEFORE the update — the tombstone overwrite
    // sets mediaUrls to null inside the transaction.
    const mediaToDelete = post.mediaUrls ?? [];

    const sequelize = this.postModel.sequelize!;
    const tx = await sequelize.transaction();
    let postDeleted = false;
    try {
      for (const a of targetAudiences) {
        await a.destroy({ transaction: tx });
      }
      if (remainingActive.length === 0) {
        await this.destroyPostFully(post, tx);
        postDeleted = true;
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    if (postDeleted) {
      await this.afterPostFullyDeleted(postId, mediaToDelete);
    } else {
      await this.searchIndexService.upsertPost(postId).catch(() => undefined);
    }

    return {
      post: postDeleted ? 'deleted' : 'kept',
      audiencesRemoved: targetAudiences.length,
    };
  }

  /**
   * Inside-transaction cleanup when a post is being soft-deleted in full.
   *
   * Tombstones plaintext on the post, cascades the same treatment to all of
   * its comments (paranoid: true on PostComment), and hard-deletes its
   * reactions (paranoid: false — no content to retain, just count noise).
   * The post itself is destroyed last so callers can rely on the fact that
   * by the time this resolves, the row is soft-deleted.
   */
  private async destroyPostFully(post: Post, tx: Transaction): Promise<void> {
    const postId = post.id;
    // 1. Tombstone + soft-delete every comment (and its replies).
    await this.commentModel.update(
      { content: DELETED_CONTENT_TOMBSTONE },
      { where: { postId }, transaction: tx },
    );
    await this.commentModel.destroy({ where: { postId }, transaction: tx });
    // 2. Reactions: no content to tombstone, just hard-delete.
    await this.reactionModel.destroy({ where: { postId }, transaction: tx });
    // 3. Tombstone the post itself + soft-delete it.
    await post.update(
      { content: DELETED_CONTENT_TOMBSTONE, mediaUrls: null },
      { transaction: tx },
    );
    await post.destroy({ transaction: tx });
  }

  /**
   * After-commit side effects when a post is fully deleted: drop search index
   * entry and purge Cloudinary assets. Failures are logged but never
   * surfaced — the user-visible state has already changed.
   */
  private async afterPostFullyDeleted(
    postId: string,
    mediaUrls: string[],
  ): Promise<void> {
    await this.searchIndexService
      .removeIfExists('post', postId)
      .catch(() => undefined);
    if (mediaUrls.length > 0) {
      this.logger.log(
        `[posts] purging ${mediaUrls.length} Cloudinary asset(s) for deleted post ${postId}`,
        'PostService',
      );
      await Promise.all(
        mediaUrls.map((url) => this.cloudinaryService.deleteByUrl(url)),
      );
    }
  }

  // =============================================================
  // COMMENTS
  // =============================================================

  async addComment(
    userId: string,
    postId: string,
    dto: CreateCommentDto,
  ): Promise<PostComment> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanViewPost(userId, postId);

    if (dto.parentCommentId) {
      const parent = await this.commentModel.findByPk(dto.parentCommentId);
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('Parent comment not found on this post');
      }
      if (parent.parentCommentId !== null) {
        throw new BadRequestException(
          'Replies can only be added to top-level comments',
        );
      }
    }

    const comment = await this.commentModel.create({
      postId,
      parentCommentId: dto.parentCommentId ?? null,
      authorId: userId,
      content: dto.content,
    });

    if (post.authorId !== userId) {
      await this.notificationService.notify({
        userId: post.authorId,
        type: NotificationType.POST_NEW_COMMENT,
        title: 'New comment on your post',
        body: 'Someone commented on your post.',
        data: { screen: 'post-detail', entityId: postId },
      });
    }

    return this.commentModel.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
        },
      ],
    }) as Promise<PostComment>;
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.commentModel.findByPk(commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.authorId !== userId) {
      const audiences = await this.audienceModel.findAll({
        where: {
          postId: comment.postId,
          audienceType: PostAudienceType.GROUP,
        },
      });
      const groupIds = audiences
        .map((a) => a.audienceId)
        .filter((id): id is string => id !== null);
      if (groupIds.length === 0) {
        throw new ForbiddenException('Cannot delete this comment');
      }

      const staffMembership = await this.memberModel.findOne({
        where: {
          userId,
          groupId: { [Op.in]: groupIds },
          role: { [Op.in]: [GroupMemberRole.OWNER, GroupMemberRole.MODERATOR] },
          leftAt: null,
        },
      });
      if (!staffMembership) {
        throw new ForbiddenException('Cannot delete this comment');
      }
    }

    // Cascade replies when removing a top-level comment so the thread
    // doesn't strand orphaned replies under a deleted parent. Replies
    // can only nest one level (enforced in addComment), so a single
    // bulk update covers it. Plaintext is tombstoned on the way out so
    // it isn't kept in the DB after a delete.
    const sequelize = this.commentModel.sequelize!;
    const tx = await sequelize.transaction();
    try {
      if (comment.parentCommentId === null) {
        await this.commentModel.update(
          { content: DELETED_CONTENT_TOMBSTONE },
          { where: { parentCommentId: comment.id }, transaction: tx },
        );
        await this.commentModel.destroy({
          where: { parentCommentId: comment.id },
          transaction: tx,
        });
      }
      await comment.update(
        { content: DELETED_CONTENT_TOMBSTONE },
        { transaction: tx },
      );
      await comment.destroy({ transaction: tx });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // =============================================================
  // REACTIONS
  // =============================================================

  async toggleReaction(
    userId: string,
    postId: string,
    dto: ToggleReactionDto,
  ): Promise<{ reacted: boolean; count: number }> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanViewPost(userId, postId);

    const reactionType = dto.reactionType ?? 'LIKE';
    const sequelize = this.reactionModel.sequelize!;
    const tx = await sequelize.transaction();

    let reacted: boolean;
    let count: number;
    try {
      const existing = await this.reactionModel.findOne({
        where: { postId, authorId: userId },
        transaction: tx,
      });

      if (existing && existing.reactionType === reactionType) {
        await existing.destroy({ transaction: tx });
        reacted = false;
      } else if (existing) {
        await existing.update({ reactionType }, { transaction: tx });
        reacted = true;
      } else {
        try {
          await this.reactionModel.create(
            { postId, authorId: userId, reactionType },
            { transaction: tx },
          );
          reacted = true;
        } catch (err) {
          if (err instanceof UniqueConstraintError) {
            // Race: another concurrent request created the reaction. Treat
            // as a successful toggle-on.
            reacted = true;
          } else {
            throw err;
          }
        }
      }

      count = await this.reactionModel.count({
        where: { postId },
        transaction: tx,
      });
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    return { reacted, count };
  }

  // =============================================================
  // INTERNAL HELPERS
  // =============================================================

  private async assertActiveMember(
    userId: string,
    groupId: string,
  ): Promise<GroupMember> {
    const m = await this.memberModel.findOne({
      where: { userId, groupId, leftAt: null },
    });
    if (!m) {
      throw new ForbiddenException('You are not a member of this group');
    }
    return m;
  }

  private async assertGroupStaff(
    userId: string,
    groupId: string,
  ): Promise<GroupMember> {
    const m = await this.assertActiveMember(userId, groupId);
    if (
      m.role !== GroupMemberRole.OWNER &&
      m.role !== GroupMemberRole.MODERATOR
    ) {
      throw new ForbiddenException('Owner or moderator role required');
    }
    return m;
  }

  /**
   * Asserts the user is an active member of at least one APPROVED, non-deleted
   * audience group on the post. Used for read access (feed, comments, reactions).
   */
  private async assertCanViewPost(
    userId: string,
    postId: string,
  ): Promise<void> {
    const audiences = await this.audienceModel.findAll({
      where: {
        postId,
        audienceType: PostAudienceType.GROUP,
        approvalState: PostAudienceApproval.APPROVED,
        deletedAt: null,
      },
    });
    const groupIds = audiences
      .map((a) => a.audienceId)
      .filter((id): id is string => id !== null);
    if (groupIds.length === 0) {
      throw new ForbiddenException('Post is not visible to you');
    }
    const member = await this.memberModel.findOne({
      where: {
        userId,
        groupId: { [Op.in]: groupIds },
        leftAt: null,
      },
    });
    if (!member) {
      throw new ForbiddenException('Post is not visible to you');
    }
  }

  private async queryFeed(
    userId: string,
    groupId: string,
    approvalState: PostAudienceApproval,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<FeedItem>> {
    const offset = getOffset(page, limit);

    const { rows: audiences, count } = await this.audienceModel.findAndCountAll(
      {
        where: {
          audienceType: PostAudienceType.GROUP,
          audienceId: groupId,
          approvalState,
        },
        include: [
          {
            model: Post,
            required: true,
            where: { deletedAt: null },
            include: [
              {
                model: User,
                as: 'author',
                attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
              },
              // Include all live audiences so the FE can offer
              // selective delete without an extra round trip.
              {
                model: PostAudience,
                as: 'audiences',
                required: false,
              },
            ],
          },
        ],
        order: [['postedAt', 'DESC']],
        offset,
        limit,
      },
    );

    const postIds = audiences.map((a) => a.postId);
    const [reactionCounts, commentCounts, myReactions] = await Promise.all([
      this.countReactionsByPost(postIds),
      this.countCommentsByPost(postIds),
      this.fetchMyReactions(userId, postIds),
    ]);

    const items: FeedItem[] = audiences.map((a) => {
      const post = a.post;
      return {
        id: post.id,
        authorId: post.authorId,
        content: post.content,
        mediaUrls: post.mediaUrls,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        reactionCount: reactionCounts.get(post.id) ?? 0,
        commentCount: commentCounts.get(post.id) ?? 0,
        myReaction: myReactions.get(post.id) ?? null,
        author: post.author
          ? {
              id: post.author.id,
              firstName: post.author.firstName,
              lastName: post.author.lastName,
              avatarUrl: post.author.avatarUrl,
            }
          : null,
        audiences: post.audiences ?? [],
      };
    });

    return buildPaginatedResponse(items, count, page, limit);
  }

  private async hydrateSingle(
    postId: string,
    userId: string,
  ): Promise<FeedItem> {
    const post = await this.postModel.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
        },
        { model: PostAudience, as: 'audiences' },
      ],
    });
    if (!post) throw new NotFoundException('Post not found');

    const [reactionCount, commentCount, myReaction] = await Promise.all([
      this.reactionModel.count({ where: { postId } }),
      this.commentModel.count({ where: { postId } }),
      this.reactionModel.findOne({ where: { postId, authorId: userId } }),
    ]);

    return {
      id: post.id,
      authorId: post.authorId,
      content: post.content,
      mediaUrls: post.mediaUrls,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      reactionCount,
      commentCount,
      myReaction: myReaction?.reactionType ?? null,
      author: post.author
        ? {
            id: post.author.id,
            firstName: post.author.firstName,
            lastName: post.author.lastName,
            avatarUrl: post.author.avatarUrl,
          }
        : null,
      audiences: post.audiences ?? [],
    };
  }

  private async countReactionsByPost(
    postIds: string[],
  ): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    const sequelize = this.reactionModel.sequelize!;
    const rows = (await this.reactionModel.findAll({
      attributes: [
        'postId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { postId: { [Op.in]: postIds } },
      group: ['postId'],
      raw: true,
    })) as unknown as Array<{ postId: string; count: string }>;
    return new Map(rows.map((r) => [r.postId, Number(r.count)]));
  }

  private async countCommentsByPost(
    postIds: string[],
  ): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    const sequelize = this.commentModel.sequelize!;
    const rows = (await this.commentModel.findAll({
      attributes: [
        'postId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { postId: { [Op.in]: postIds } },
      group: ['postId'],
      raw: true,
    })) as unknown as Array<{ postId: string; count: string }>;
    return new Map(rows.map((r) => [r.postId, Number(r.count)]));
  }

  private async fetchMyReactions(
    userId: string,
    postIds: string[],
  ): Promise<Map<string, string>> {
    if (postIds.length === 0) return new Map();
    const rows = await this.reactionModel.findAll({
      where: { authorId: userId, postId: { [Op.in]: postIds } },
    });
    return new Map(rows.map((r) => [r.postId, r.reactionType]));
  }

  private async notifyPendingApproval(
    postId: string,
    authorId: string,
    groupIds: string[],
  ): Promise<void> {
    const staff = await this.memberModel.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        role: { [Op.in]: [GroupMemberRole.OWNER, GroupMemberRole.MODERATOR] },
        leftAt: null,
      },
    });
    const staffUserIds = Array.from(
      new Set(staff.map((m) => m.userId).filter((id) => id !== authorId)),
    );
    if (staffUserIds.length === 0) return;

    await this.notificationService.notifyMany(staffUserIds, {
      type: NotificationType.POST_PENDING_APPROVAL,
      title: 'A post needs your review',
      body: 'A member has posted in a group you moderate.',
      data: { screen: 'post-pending', entityId: postId },
    });
  }
}
