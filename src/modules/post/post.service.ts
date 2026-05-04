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
import { Post, PostApprovalState } from './entities/post.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostReaction } from './entities/post-reaction.entity';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { Group, MemberPostPolicy } from '../group/entities/group.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group/entities/group-member.entity';
import { GroupService } from '../group/group.service';
import { User } from '../user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
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
 * Tombstone written into post/comment `content` when the row is
 * soft-deleted, so the plaintext doesn't sit in the DB after delete.
 * The row itself is kept (paranoid: true) for audit; the body is gone.
 */
const DELETED_CONTENT_TOMBSTONE = '[deleted]';

export interface FeedItem {
  id: string;
  authorId: string;
  groupId: string;
  approvalState: PostApprovalState;
  content: string;
  mediaUrls: string[] | null;
  postedAt: Date;
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
  /**
   * Optional. Populated by the cross-group feed (`getMyFeed`) so the FE
   * can label which group a post came from. The per-group feed leaves
   * this `null` because the group is implicit in the URL.
   */
  group?: { id: string; name: string; logoUrl: string | null } | null;
}

/** Per-group spec used inside the create-post fan-out. */
interface GroupCreateSpec {
  group: Group;
  approvalState: PostApprovalState;
}

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post) private readonly postModel: typeof Post,
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
    private readonly groupService: GroupService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =====================================================================
  // CREATE — fan-out to one independent post per group
  // =====================================================================

  /**
   * Create one post per groupId in `dto.groupIds`. Each post owns its own
   * comments / reactions / image copies. Cross-posting in the FE is a
   * single API call here; we resolve every group's approval state up
   * front, then create posts one-by-one (each in its own transaction so a
   * downstream failure on post #3 doesn't roll back posts #1 and #2).
   *
   * Image handling: the FE uploads each image once via /posts/upload-image
   * (staging URL). For each created post we clone every staging asset
   * into the post's per-post Cloudinary folder. After all posts are
   * created we delete the original staging asset so it doesn't linger.
   */
  async createPost(
    authorId: string,
    dto: CreatePostDto,
  ): Promise<{ posts: FeedItem[] }> {
    const uniqueGroupIds = Array.from(new Set(dto.groupIds));
    if (uniqueGroupIds.length !== dto.groupIds.length) {
      throw new BadRequestException('Duplicate groupIds in request');
    }

    if (dto.mediaUrls?.length) {
      this.cloudinaryService.assertOwnedUrls(dto.mediaUrls);
    }

    const specs = await this.resolveCreateSpecs(authorId, uniqueGroupIds);
    const stagingUrls = dto.mediaUrls ?? [];

    const created: Post[] = [];
    for (const spec of specs) {
      const post = await this.createSinglePost(
        authorId,
        spec,
        dto.content,
        stagingUrls,
      );
      created.push(post);
    }

    // After-commit: search index, notifications, staging cleanup.
    // None of these can roll back the posts; they're best-effort.
    await Promise.all(
      created.map((p) =>
        this.searchIndexService.upsertPost(p.id).catch((err) => {
          this.logger.error(
            `[posts] search index upsert failed for ${p.id}: ${(err as Error).message}`,
            'PostService',
          );
        }),
      ),
    );
    await this.notifyAuthorsForPending(authorId, created);
    await Promise.all(
      stagingUrls.map((url) => this.cloudinaryService.deleteByUrl(url)),
    );

    const items = await Promise.all(
      created.map((p) => this.hydrateSingle(p.id, authorId)),
    );
    return { posts: items };
  }

  /**
   * Resolve every target group's membership + post policy + role in one
   * pair of queries, then derive the per-group approval state. Throws on
   * any group the author can't post into so the entire fan-out aborts
   * before we touch the DB.
   */
  private async resolveCreateSpecs(
    authorId: string,
    groupIds: string[],
  ): Promise<GroupCreateSpec[]> {
    const groups = await this.groupModel.findAll({
      where: { id: { [Op.in]: groupIds } },
    });
    if (groups.length !== groupIds.length) {
      throw new NotFoundException('One or more groups were not found');
    }

    const memberships = await this.memberModel.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        userId: authorId,
        leftAt: null,
      },
    });
    const membershipByGroup = new Map(memberships.map((m) => [m.groupId, m]));

    const specs: GroupCreateSpec[] = [];
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
        specs.push({ group, approvalState: PostApprovalState.APPROVED });
        continue;
      }

      if (group.memberPostPolicy === MemberPostPolicy.DISABLED) {
        throw new ForbiddenException(
          `Members are not allowed to post in group ${group.id}`,
        );
      }

      specs.push({
        group,
        approvalState:
          group.memberPostPolicy === MemberPostPolicy.APPROVAL_REQUIRED
            ? PostApprovalState.PENDING
            : PostApprovalState.APPROVED,
      });
    }

    return specs;
  }

  /**
   * Insert one post + clone every staging asset into the post's folder.
   * Uses a transaction for the DB writes; image clones happen after
   * commit so a Cloudinary slowdown can't tie up a Postgres connection.
   * If image cloning fails partway through, the post still exists with
   * the assets that were cloned so far — the user retries by editing.
   */
  private async createSinglePost(
    authorId: string,
    spec: GroupCreateSpec,
    content: string,
    stagingUrls: string[],
  ): Promise<Post> {
    const sequelize = this.postModel.sequelize!;
    const tx = await sequelize.transaction();
    let post: Post;
    try {
      post = await this.postModel.create(
        {
          authorId,
          groupId: spec.group.id,
          approvalState: spec.approvalState,
          content,
          mediaUrls: null,
        },
        { transaction: tx },
      );
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    if (stagingUrls.length > 0) {
      const cloned: string[] = [];
      for (const src of stagingUrls) {
        try {
          const { url } = await this.cloudinaryService.cloneByUrl(src, {
            resource: 'posts',
            userId: authorId,
            postId: post.id,
          });
          cloned.push(url);
        } catch (err) {
          this.logger.error(
            `[posts] cloneByUrl failed for ${src} on post ${post.id}: ${(err as Error).message}`,
            'PostService',
          );
        }
      }
      if (cloned.length > 0) {
        await post.update({ mediaUrls: cloned });
      }
    }

    return post;
  }

  /** Notify staff of every group where this fan-out produced a PENDING post. */
  private async notifyAuthorsForPending(
    authorId: string,
    posts: Post[],
  ): Promise<void> {
    const pending = posts.filter(
      (p) => p.approvalState === PostApprovalState.PENDING,
    );
    if (pending.length === 0) return;

    const groupIds = pending.map((p) => p.groupId);
    const staff = await this.memberModel.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        role: { [Op.in]: [GroupMemberRole.OWNER, GroupMemberRole.MODERATOR] },
        leftAt: null,
      },
    });

    // One notification per (post, staffUser). Deduped by post id.
    for (const post of pending) {
      const recipients = staff
        .filter((m) => m.groupId === post.groupId && m.userId !== authorId)
        .map((m) => m.userId);
      if (recipients.length === 0) continue;
      await this.notificationService.notifyMany(recipients, {
        type: NotificationType.POST_PENDING_APPROVAL,
        title: 'A post needs your review',
        body: 'A member has posted in a group you moderate.',
        data: { screen: 'post-pending', entityId: post.id },
      });
    }
  }

  // =====================================================================
  // READ
  // =====================================================================

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
      PostApprovalState.APPROVED,
      page,
      limit,
    );
  }

  /**
   * Aggregated feed across every group the user is an active member of.
   *
   * Mirrors Facebook's "groups feed" surface — APPROVED posts only,
   * sorted by `postedAt DESC`, paginated. Each item is enriched with
   * `group: { id, name, logoUrl }` so the FE can show a "posted in X"
   * badge above the author line.
   *
   * Returns an empty paginated response when the user has no
   * memberships, avoiding a wasted DB round-trip.
   */
  async getMyFeed(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<FeedItem>> {
    const groupIds = await this.groupService.findMyGroupIds(userId);
    if (groupIds.length === 0) {
      return buildPaginatedResponse([], 0, page, limit);
    }

    const offset = getOffset(page, limit);

    const { rows: posts, count } = await this.postModel.findAndCountAll({
      where: {
        groupId: { [Op.in]: groupIds },
        approvalState: PostApprovalState.APPROVED,
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
        },
        {
          model: Group,
          as: 'group',
          attributes: ['id', 'name', 'logoUrl'],
        },
      ],
      order: [['postedAt', 'DESC']],
      offset,
      limit,
    });

    const items = await this.hydrateFeedItems(posts, userId, {
      includeGroup: true,
    });
    return buildPaginatedResponse(items, count, page, limit);
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
      PostApprovalState.PENDING,
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
    const post = await this.assertCanViewPost(userId, postId);

    const offset = getOffset(page, limit);

    const { rows, count } = await this.commentModel.findAndCountAll({
      where: { postId: post.id, parentCommentId: null },
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

  // =====================================================================
  // UPDATE
  // =====================================================================

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

    const previousMedia = post.mediaUrls ?? [];

    const updates: Partial<Post> = {};
    if (dto.content !== undefined) updates.content = dto.content;
    if (dto.mediaUrls !== undefined) {
      updates.mediaUrls = dto.mediaUrls.length === 0 ? null : dto.mediaUrls;
    }
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
    dto: ModeratePostDto,
  ): Promise<void> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    await this.assertGroupStaff(userId, post.groupId);

    if (post.approvalState !== PostApprovalState.PENDING) {
      throw new BadRequestException(
        `This post is already ${post.approvalState.toLowerCase()}`,
      );
    }

    if (dto.decision === ModerationDecision.APPROVED) {
      await post.update({ approvalState: PostApprovalState.APPROVED });
      await this.searchIndexService.upsertPost(postId).catch(() => undefined);
    } else {
      // REJECTED: tombstone + soft-delete + purge assets. The post becomes
      // unrecoverable from the user's view; mods can still query soft-
      // deleted rows for audit.
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
      await this.afterPostFullyDeleted(postId, post.authorId, mediaToDelete);
    }

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

  // =====================================================================
  // DELETE
  // =====================================================================

  async deletePost(userId: string, postId: string): Promise<{ deleted: true }> {
    // Bypass paranoid filter so we can detect "already soft-deleted" and
    // short-circuit idempotently.
    const post = await this.postModel.findOne({
      where: { id: postId },
      paranoid: false,
    });
    if (!post) throw new NotFoundException('Post not found');

    // Idempotent on retries.
    if (post.deletedAt !== null) {
      return { deleted: true };
    }

    // Author can delete their own; group OWNER/MODERATOR can delete any.
    if (post.authorId !== userId) {
      await this.assertGroupStaff(userId, post.groupId);
    }

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

    await this.afterPostFullyDeleted(postId, post.authorId, mediaToDelete);
    return { deleted: true };
  }

  // =====================================================================
  // COMMENTS
  // =====================================================================

  async addComment(
    userId: string,
    postId: string,
    dto: CreateCommentDto,
  ): Promise<PostComment> {
    const post = await this.assertCanViewPost(userId, postId);

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
      // Non-author: must be staff of the post's group.
      const post = await this.postModel.findByPk(comment.postId);
      if (!post) throw new NotFoundException('Post not found');
      await this.assertGroupStaff(userId, post.groupId);
    }

    // Cascade replies for top-level comments. Replies are 1-level only
    // (enforced in addComment), so a single bulk update covers it.
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

  // =====================================================================
  // REACTIONS
  // =====================================================================

  async toggleReaction(
    userId: string,
    postId: string,
    dto: ToggleReactionDto,
  ): Promise<{ reacted: boolean; count: number }> {
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
            // Race: another concurrent request created the reaction.
            // Treat as a successful toggle-on.
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

  // =====================================================================
  // SHARED HELPERS
  // =====================================================================

  /**
   * Inside-transaction cleanup when a post is being soft-deleted in full.
   *
   * Tombstones plaintext on the post, cascades the same treatment to its
   * comments (paranoid: true on PostComment), and hard-deletes its
   * reactions (paranoid: false — no content to retain).
   */
  private async destroyPostFully(post: Post, tx: Transaction): Promise<void> {
    const postId = post.id;
    await this.commentModel.update(
      { content: DELETED_CONTENT_TOMBSTONE },
      { where: { postId }, transaction: tx },
    );
    await this.commentModel.destroy({ where: { postId }, transaction: tx });
    await this.reactionModel.destroy({ where: { postId }, transaction: tx });
    await post.update(
      { content: DELETED_CONTENT_TOMBSTONE, mediaUrls: null },
      { transaction: tx },
    );
    await post.destroy({ transaction: tx });
  }

  /**
   * After-commit side effects when a post is fully deleted: drop search
   * index entry and purge the post's Cloudinary folder. Failures are
   * logged but never surfaced — the user-visible state already changed.
   */
  private async afterPostFullyDeleted(
    postId: string,
    authorId: string,
    mediaUrls: string[],
  ): Promise<void> {
    await this.searchIndexService
      .removeIfExists('post', postId)
      .catch(() => undefined);
    if (mediaUrls.length > 0) {
      // Nuke the post's folder in one shot — covers every media URL plus
      // any orphaned versions (e.g. transformations Cloudinary may have
      // generated). Falls back to per-URL delete if the folder API fails.
      const folder = this.cloudinaryService.buildPostFolder(authorId, postId);
      await this.cloudinaryService.deleteFolder(folder);
    }
  }

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
   * Resolves the post + asserts the user can view it (active member of
   * its group, post must be APPROVED). Returns the Post for callers that
   * need it. Throws ForbiddenException on miss — never NotFoundException
   * on access denial, so we don't leak existence to non-members.
   */
  private async assertCanViewPost(
    userId: string,
    postId: string,
  ): Promise<Post> {
    const post = await this.postModel.findByPk(postId);
    if (!post) throw new NotFoundException('Post not found');
    if (post.approvalState !== PostApprovalState.APPROVED) {
      throw new ForbiddenException('Post is not visible to you');
    }
    await this.assertActiveMember(userId, post.groupId);
    return post;
  }

  private async queryFeed(
    userId: string,
    groupId: string,
    approvalState: PostApprovalState,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<FeedItem>> {
    const offset = getOffset(page, limit);

    const { rows: posts, count } = await this.postModel.findAndCountAll({
      where: { groupId, approvalState },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl'],
        },
      ],
      order: [['postedAt', 'DESC']],
      offset,
      limit,
    });

    const items = await this.hydrateFeedItems(posts, userId);
    return buildPaginatedResponse(items, count, page, limit);
  }

  /**
   * Hydrate a batch of posts with reactions, comments, and the caller's
   * own reaction. Shared by the per-group and aggregated feeds.
   *
   * `includeGroup`: pass `true` when the posts were loaded with the
   * `group` association — the helper will surface it on each FeedItem.
   */
  private async hydrateFeedItems(
    posts: Post[],
    userId: string,
    options: { includeGroup?: boolean } = {},
  ): Promise<FeedItem[]> {
    const postIds = posts.map((p) => p.id);
    const [reactionCounts, commentCounts, myReactions] = await Promise.all([
      this.countReactionsByPost(postIds),
      this.countCommentsByPost(postIds),
      this.fetchMyReactions(userId, postIds),
    ]);

    return posts.map((post) => ({
      id: post.id,
      authorId: post.authorId,
      groupId: post.groupId,
      approvalState: post.approvalState,
      content: post.content,
      mediaUrls: post.mediaUrls,
      postedAt: post.postedAt,
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
      group:
        options.includeGroup && post.group
          ? {
              id: post.group.id,
              name: post.group.name,
              logoUrl: post.group.logoUrl,
            }
          : null,
    }));
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
      groupId: post.groupId,
      approvalState: post.approvalState,
      content: post.content,
      mediaUrls: post.mediaUrls,
      postedAt: post.postedAt,
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
}
