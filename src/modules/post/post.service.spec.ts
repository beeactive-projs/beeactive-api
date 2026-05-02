import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UniqueConstraintError, ValidationErrorItem } from 'sequelize';

import { PostService } from './post.service';
import { Post } from './entities/post.entity';
import {
  PostAudience,
  PostAudienceApproval,
  PostAudienceType,
} from './entities/post-audience.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostReaction } from './entities/post-reaction.entity';
import { Group, MemberPostPolicy } from '../group/entities/group.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group/entities/group-member.entity';
import { SearchIndexService } from '../search/search-index.service';
import { NotificationService } from '../notification/notification.service';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

// Common shape for the Sequelize-model mocks below. Each test only
// uses a subset of these but typing them up-front kills the
// "unsafe any" lint cascade.
interface PostModelMock {
  sequelize: { transaction: jest.Mock };
  create: jest.Mock;
  findByPk: jest.Mock;
  findOne: jest.Mock;
  findAll: jest.Mock;
}

interface AudienceModelMock {
  sequelize: { transaction: jest.Mock };
  create: jest.Mock;
  bulkCreate: jest.Mock;
  findAll: jest.Mock;
  findOne: jest.Mock;
}

interface CommentModelMock {
  sequelize: { transaction: jest.Mock };
  create: jest.Mock;
  findAll: jest.Mock;
  findByPk: jest.Mock;
  findAndCountAll: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  destroy: jest.Mock;
}

interface ReactionModelMock {
  sequelize: { transaction: jest.Mock };
  create: jest.Mock;
  findAll: jest.Mock;
  findOne: jest.Mock;
  count: jest.Mock;
  destroy: jest.Mock;
}

interface GroupModelMock {
  sequelize: { transaction: jest.Mock };
  findAll: jest.Mock;
}

interface MemberModelMock {
  sequelize: { transaction: jest.Mock };
  findOne: jest.Mock;
  findAll: jest.Mock;
}

// PostService — focused tests on the load-bearing paths:
//   - createPost across the three group policies + non-member rejection
//   - deletePost selective behavior (last-audience triggers post deletion)
//   - addComment parent-depth validation
//   - toggleReaction add/remove/race-idempotency
// Not exhaustive; the goal is to catch policy-level regressions.

describe('PostService', () => {
  let service: PostService;
  let postModel: PostModelMock;
  let audienceModel: AudienceModelMock;
  let commentModel: CommentModelMock;
  let reactionModel: ReactionModelMock;
  let groupModel: GroupModelMock;
  let memberModel: MemberModelMock;
  let searchIndex: { upsertPost: jest.Mock; removeIfExists: jest.Mock };
  let notificationService: { notify: jest.Mock; notifyMany: jest.Mock };
  let cloudinaryService: {
    isOwnedUrl: jest.Mock;
    assertOwnedUrls: jest.Mock;
    extractPublicId: jest.Mock;
    deleteByUrl: jest.Mock;
  };

  const tx = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
  const sequelize = { transaction: jest.fn().mockResolvedValue(tx) };

  beforeEach(async () => {
    tx.commit.mockClear();
    tx.rollback.mockClear();
    sequelize.transaction.mockClear();

    postModel = {
      sequelize,
      create: jest.fn(),
      findByPk: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
    };
    audienceModel = {
      sequelize,
      create: jest.fn(),
      bulkCreate: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    };
    commentModel = {
      sequelize,
      create: jest.fn(),
      findAll: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue([0]),
      destroy: jest.fn().mockResolvedValue(0),
    };
    reactionModel = {
      sequelize,
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      destroy: jest.fn().mockResolvedValue(0),
    };
    groupModel = {
      sequelize,
      findAll: jest.fn(),
    };
    memberModel = {
      sequelize,
      findOne: jest.fn(),
      findAll: jest.fn(),
    };
    searchIndex = {
      upsertPost: jest.fn().mockResolvedValue(undefined),
      removeIfExists: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };
    cloudinaryService = {
      isOwnedUrl: jest.fn().mockReturnValue(true),
      assertOwnedUrls: jest.fn(),
      extractPublicId: jest.fn().mockReturnValue('mock-id'),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: getModelToken(Post), useValue: postModel },
        { provide: getModelToken(PostAudience), useValue: audienceModel },
        { provide: getModelToken(PostComment), useValue: commentModel },
        { provide: getModelToken(PostReaction), useValue: reactionModel },
        { provide: getModelToken(Group), useValue: groupModel },
        { provide: getModelToken(GroupMember), useValue: memberModel },
        { provide: SearchIndexService, useValue: searchIndex },
        { provide: NotificationService, useValue: notificationService },
        { provide: CloudinaryService, useValue: cloudinaryService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = module.get(PostService);
  });

  // ─────────────── createPost ───────────────

  describe('createPost', () => {
    const authorId = 'user-1';
    const baseDto = { content: 'hi', groupIds: ['g1'] };

    function mockHydrate(postId: string) {
      // hydrateSingle hits findByPk(post) + counts. Provide enough stubs.
      postModel.findByPk.mockResolvedValue({
        id: postId,
        authorId,
        content: 'hi',
        mediaUrls: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: null,
        audiences: [],
      });
      reactionModel.count.mockResolvedValue(0);
      commentModel.count.mockResolvedValue(0);
      reactionModel.findOne.mockResolvedValue(null);
    }

    it('creates a post APPROVED when caller is OWNER even if policy=DISABLED', async () => {
      groupModel.findAll.mockResolvedValue([
        { id: 'g1', memberPostPolicy: MemberPostPolicy.DISABLED },
      ]);
      memberModel.findAll.mockResolvedValue([
        { groupId: 'g1', userId: authorId, role: GroupMemberRole.OWNER },
      ]);
      postModel.create.mockResolvedValue({ id: 'post-1' });
      mockHydrate('post-1');

      await service.createPost(authorId, baseDto);

      expect(audienceModel.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            audienceId: 'g1',
            approvalState: PostAudienceApproval.APPROVED,
          }),
        ],
        expect.anything(),
      );
      expect(notificationService.notifyMany).not.toHaveBeenCalled();
    });

    it('creates a post APPROVED when policy=OPEN and caller is MEMBER', async () => {
      groupModel.findAll.mockResolvedValue([
        { id: 'g1', memberPostPolicy: MemberPostPolicy.OPEN },
      ]);
      memberModel.findAll.mockResolvedValue([
        { groupId: 'g1', userId: authorId, role: GroupMemberRole.MEMBER },
      ]);
      postModel.create.mockResolvedValue({ id: 'post-1' });
      mockHydrate('post-1');

      await service.createPost(authorId, baseDto);

      expect(audienceModel.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            approvalState: PostAudienceApproval.APPROVED,
          }),
        ],
        expect.anything(),
      );
    });

    it('creates a post PENDING when policy=APPROVAL_REQUIRED and caller is MEMBER', async () => {
      groupModel.findAll.mockResolvedValue([
        { id: 'g1', memberPostPolicy: MemberPostPolicy.APPROVAL_REQUIRED },
      ]);
      memberModel.findAll
        .mockResolvedValueOnce([
          { groupId: 'g1', userId: authorId, role: GroupMemberRole.MEMBER },
        ])
        // Second call: notifyPendingApproval looks up the staff to notify.
        .mockResolvedValueOnce([
          { groupId: 'g1', userId: 'owner-1', role: GroupMemberRole.OWNER },
        ]);
      postModel.create.mockResolvedValue({ id: 'post-1' });
      mockHydrate('post-1');

      await service.createPost(authorId, baseDto);

      expect(audienceModel.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            approvalState: PostAudienceApproval.PENDING,
          }),
        ],
        expect.anything(),
      );
      expect(notificationService.notifyMany).toHaveBeenCalledWith(
        ['owner-1'],
        expect.objectContaining({
          type: 'POST_PENDING_APPROVAL',
        }),
      );
    });

    it('rejects MEMBER posting in a DISABLED group', async () => {
      groupModel.findAll.mockResolvedValue([
        { id: 'g1', memberPostPolicy: MemberPostPolicy.DISABLED },
      ]);
      memberModel.findAll.mockResolvedValue([
        { groupId: 'g1', userId: authorId, role: GroupMemberRole.MEMBER },
      ]);

      await expect(service.createPost(authorId, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(postModel.create).not.toHaveBeenCalled();
    });

    it('rejects when caller is not a member of a target group', async () => {
      groupModel.findAll.mockResolvedValue([
        { id: 'g1', memberPostPolicy: MemberPostPolicy.OPEN },
      ]);
      memberModel.findAll.mockResolvedValue([]); // no membership

      await expect(service.createPost(authorId, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects duplicate groupIds', async () => {
      await expect(
        service.createPost(authorId, { content: 'x', groupIds: ['g1', 'g1'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────── deletePost — selective ───────────────

  describe('deletePost', () => {
    const authorId = 'user-1';
    const postId = 'post-1';

    function makeAudience(audienceId: string, deletedAt: Date | null = null) {
      return {
        id: `aud-${audienceId}`,
        postId,
        audienceType: PostAudienceType.GROUP,
        audienceId,
        deletedAt,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('selective delete keeps the post when other audiences remain', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: null,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      const audA = makeAudience('g1');
      const audB = makeAudience('g2');
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([audA, audB]);

      const result = await service.deletePost(authorId, postId, {
        groupIds: ['g1'],
      });

      expect(audA.destroy).toHaveBeenCalled();
      expect(audB.destroy).not.toHaveBeenCalled();
      expect(post.destroy).not.toHaveBeenCalled();
      expect(searchIndex.upsertPost).toHaveBeenCalledWith(postId);
      expect(searchIndex.removeIfExists).not.toHaveBeenCalled();
      expect(result).toEqual({ post: 'kept', audiencesRemoved: 1 });
    });

    it('full delete (no groupIds) removes everything and soft-deletes the post', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: null,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      const audA = makeAudience('g1');
      const audB = makeAudience('g2');
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([audA, audB]);

      const result = await service.deletePost(authorId, postId, {});

      expect(audA.destroy).toHaveBeenCalled();
      expect(audB.destroy).toHaveBeenCalled();
      // Tombstone written before destroy so plaintext is gone.
      expect(post.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: '[deleted]', mediaUrls: null }),
        expect.anything(),
      );
      expect(post.destroy).toHaveBeenCalled();
      expect(searchIndex.removeIfExists).toHaveBeenCalledWith('post', postId);
      expect(result).toEqual({ post: 'deleted', audiencesRemoved: 2 });
    });

    it('removing the LAST audience auto-deletes the post', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: null,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      const audA = makeAudience('g1');
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([audA]);

      const result = await service.deletePost(authorId, postId, {
        groupIds: ['g1'],
      });

      expect(audA.destroy).toHaveBeenCalled();
      expect(post.update).toHaveBeenCalled();
      expect(post.destroy).toHaveBeenCalled();
      expect(result.post).toBe('deleted');
    });

    it('non-author non-moderator is rejected', async () => {
      const post = {
        id: postId,
        authorId: 'somebody-else',
        deletedAt: null,
        mediaUrls: null,
      };
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([makeAudience('g1')]);
      memberModel.findAll.mockResolvedValue([]); // not a moderator anywhere

      await expect(service.deletePost(authorId, postId, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('moderator can delete from groups they moderate', async () => {
      const post = {
        id: postId,
        authorId: 'somebody-else',
        deletedAt: null,
        mediaUrls: null,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      const audA = makeAudience('g1');
      const audB = makeAudience('g2');
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([audA, audB]);
      // caller moderates g1 only
      memberModel.findAll.mockResolvedValue([
        { groupId: 'g1', userId: authorId, role: GroupMemberRole.MODERATOR },
      ]);

      const result = await service.deletePost(authorId, postId, {});

      expect(audA.destroy).toHaveBeenCalled();
      expect(audB.destroy).not.toHaveBeenCalled();
      // Post survives because g2 still has it.
      expect(post.destroy).not.toHaveBeenCalled();
      expect(result).toEqual({ post: 'kept', audiencesRemoved: 1 });
    });
  });

  // ─────────────── addComment depth validation ───────────────

  describe('addComment', () => {
    const userId = 'user-1';
    const postId = 'post-1';

    beforeEach(() => {
      postModel.findByPk.mockResolvedValue({
        id: postId,
        authorId: 'author-2',
      });
      // assertCanViewPost: at least one APPROVED audience + active membership
      audienceModel.findAll.mockResolvedValue([
        {
          postId,
          audienceType: PostAudienceType.GROUP,
          audienceId: 'g1',
          approvalState: PostAudienceApproval.APPROVED,
        },
      ]);
      memberModel.findOne.mockResolvedValue({
        userId,
        groupId: 'g1',
        leftAt: null,
      });
      commentModel.create.mockResolvedValue({ id: 'c1' });
      commentModel.findByPk.mockResolvedValue({
        id: 'c1',
        author: { id: userId, firstName: 'A', lastName: 'B', avatarUrl: null },
      });
    });

    it('allows a top-level comment', async () => {
      await service.addComment(userId, postId, { content: 'hello' });
      expect(commentModel.create).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'POST_NEW_COMMENT',
          userId: 'author-2',
        }),
      );
    });

    it('allows a 1-level reply', async () => {
      commentModel.findByPk
        .mockResolvedValueOnce({
          id: 'parent-1',
          postId,
          parentCommentId: null,
        })
        .mockResolvedValueOnce({
          id: 'c1',
          author: null,
        });
      await service.addComment(userId, postId, {
        content: 'reply',
        parentCommentId: 'parent-1',
      });
      expect(commentModel.create).toHaveBeenCalled();
    });

    it('rejects a reply to a reply (parent has its own parent)', async () => {
      commentModel.findByPk.mockResolvedValueOnce({
        id: 'reply-1',
        postId,
        parentCommentId: 'parent-1', // ← this is the depth-2 case
      });
      await expect(
        service.addComment(userId, postId, {
          content: 'too deep',
          parentCommentId: 'reply-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reply pointing to a different post', async () => {
      commentModel.findByPk.mockResolvedValueOnce({
        id: 'parent-x',
        postId: 'other-post',
        parentCommentId: null,
      });
      await expect(
        service.addComment(userId, postId, {
          content: 'wrong post',
          parentCommentId: 'parent-x',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does NOT notify when commenter is the post author', async () => {
      postModel.findByPk.mockResolvedValue({ id: postId, authorId: userId });
      await service.addComment(userId, postId, { content: 'self' });
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });

  // ─────────────── toggleReaction ───────────────

  describe('toggleReaction', () => {
    const userId = 'user-1';
    const postId = 'post-1';

    beforeEach(() => {
      postModel.findByPk.mockResolvedValue({ id: postId, authorId: 'a' });
      audienceModel.findAll.mockResolvedValue([
        {
          postId,
          audienceType: PostAudienceType.GROUP,
          audienceId: 'g1',
          approvalState: PostAudienceApproval.APPROVED,
        },
      ]);
      memberModel.findOne.mockResolvedValue({ userId, groupId: 'g1' });
    });

    it('adds a reaction when none exists', async () => {
      reactionModel.findOne.mockResolvedValue(null);
      reactionModel.count.mockResolvedValue(1);
      const result = await service.toggleReaction(userId, postId, {});
      expect(reactionModel.create).toHaveBeenCalled();
      expect(result).toEqual({ reacted: true, count: 1 });
    });

    it('removes a reaction when one already exists with the same type', async () => {
      const existing = {
        reactionType: 'LIKE',
        destroy: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(),
      };
      reactionModel.findOne.mockResolvedValue(existing);
      reactionModel.count.mockResolvedValue(0);
      const result = await service.toggleReaction(userId, postId, {});
      expect(existing.destroy).toHaveBeenCalled();
      expect(result).toEqual({ reacted: false, count: 0 });
    });

    it('treats a unique-constraint race as idempotent toggle-on', async () => {
      reactionModel.findOne.mockResolvedValue(null);
      reactionModel.create.mockRejectedValueOnce(
        new UniqueConstraintError({
          errors: [] as ValidationErrorItem[],
          message: 'race',
        }),
      );
      reactionModel.count.mockResolvedValue(1);
      const result = await service.toggleReaction(userId, postId, {});
      expect(result).toEqual({ reacted: true, count: 1 });
    });
  });

  // ─────────────── deleteComment — tombstone + cascade ───────────────

  describe('deleteComment', () => {
    const userId = 'user-1';
    const commentId = 'c-top';
    const postId = 'post-1';

    it('tombstones the content and cascades replies for top-level author delete', async () => {
      const comment = {
        id: commentId,
        postId,
        authorId: userId,
        parentCommentId: null,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      commentModel.findByPk.mockResolvedValue(comment);

      await service.deleteComment(userId, commentId);

      // Replies cascaded.
      expect(commentModel.update).toHaveBeenCalledWith(
        { content: '[deleted]' },
        expect.objectContaining({
          where: { parentCommentId: commentId },
        }),
      );
      expect(commentModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parentCommentId: commentId },
        }),
      );
      // Self tombstoned + soft-deleted.
      expect(comment.update).toHaveBeenCalledWith(
        { content: '[deleted]' },
        expect.anything(),
      );
      expect(comment.destroy).toHaveBeenCalled();
    });

    it('does NOT cascade replies when deleting a reply (parent of nothing)', async () => {
      const reply = {
        id: 'reply-1',
        postId,
        authorId: userId,
        parentCommentId: commentId,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      commentModel.findByPk.mockResolvedValue(reply);

      await service.deleteComment(userId, 'reply-1');

      expect(commentModel.update).not.toHaveBeenCalled();
      expect(commentModel.destroy).not.toHaveBeenCalled();
      expect(reply.update).toHaveBeenCalledWith(
        { content: '[deleted]' },
        expect.anything(),
      );
      expect(reply.destroy).toHaveBeenCalled();
    });

    it('rejects when caller is neither author nor staff', async () => {
      commentModel.findByPk.mockResolvedValue({
        id: commentId,
        postId,
        authorId: 'other-user',
        parentCommentId: null,
        update: jest.fn(),
        destroy: jest.fn(),
      });
      audienceModel.findAll.mockResolvedValue([
        {
          postId,
          audienceType: PostAudienceType.GROUP,
          audienceId: 'g1',
        },
      ]);
      memberModel.findOne.mockResolvedValue(null);

      await expect(service.deleteComment(userId, commentId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a staff non-author to delete', async () => {
      const comment = {
        id: commentId,
        postId,
        authorId: 'other-user',
        parentCommentId: null,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      commentModel.findByPk.mockResolvedValue(comment);
      audienceModel.findAll.mockResolvedValue([
        {
          postId,
          audienceType: PostAudienceType.GROUP,
          audienceId: 'g1',
        },
      ]);
      memberModel.findOne.mockResolvedValue({
        userId,
        groupId: 'g1',
        role: GroupMemberRole.MODERATOR,
        leftAt: null,
      });

      await service.deleteComment(userId, commentId);

      expect(comment.destroy).toHaveBeenCalled();
    });
  });

  // ─────────────── Cloudinary URL whitelist ───────────────

  describe('createPost — mediaUrls whitelist', () => {
    const authorId = 'user-1';

    it('rejects mediaUrls that fail the Cloudinary check', async () => {
      cloudinaryService.assertOwnedUrls.mockImplementationOnce(() => {
        throw new BadRequestException('mediaUrls must be Cloudinary URLs');
      });

      await expect(
        service.createPost(authorId, {
          content: 'evil',
          groupIds: ['g1'],
          mediaUrls: ['https://evil.example.com/a.png'],
        }),
      ).rejects.toThrow(BadRequestException);
      // Membership/group lookups should not run when URL validation fails up front.
      expect(groupModel.findAll).not.toHaveBeenCalled();
    });
  });

  // ─────────────── Cloudinary asset cleanup ───────────────

  describe('asset cleanup', () => {
    const authorId = 'user-1';
    const postId = 'post-1';

    function makeAudience(audienceId: string, deletedAt: Date | null = null) {
      return {
        id: `aud-${audienceId}`,
        postId,
        audienceType: PostAudienceType.GROUP,
        audienceId,
        deletedAt,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('purges Cloudinary assets when a post is fully deleted', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'],
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([makeAudience('g1')]);

      await service.deletePost(authorId, postId, {});

      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledWith(
        'https://res.cloudinary.com/c/image/upload/v1/a.png',
      );
    });

    it('does NOT purge Cloudinary assets on a partial (audience-only) delete', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'],
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      const audA = makeAudience('g1');
      const audB = makeAudience('g2');
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([audA, audB]);

      await service.deletePost(authorId, postId, { groupIds: ['g1'] });

      // Post survived in g2 — asset must stay.
      expect(cloudinaryService.deleteByUrl).not.toHaveBeenCalled();
    });

    it('purges only the URLs that were removed on update', async () => {
      const post = {
        id: postId,
        authorId,
        mediaUrls: [
          'https://res.cloudinary.com/c/image/upload/v1/a.png',
          'https://res.cloudinary.com/c/image/upload/v1/b.png',
        ],
        update: jest.fn().mockResolvedValue(undefined),
      };
      postModel.findByPk.mockResolvedValue(post);

      await service.updatePost(authorId, postId, {
        mediaUrls: ['https://res.cloudinary.com/c/image/upload/v1/b.png'],
      });

      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledTimes(1);
      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledWith(
        'https://res.cloudinary.com/c/image/upload/v1/a.png',
      );
    });

    it('idempotent on already-soft-deleted post: returns success without doing work', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: new Date(),
        mediaUrls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'],
        destroy: jest.fn(),
        update: jest.fn(),
      };
      postModel.findOne.mockResolvedValue(post);

      const result = await service.deletePost(authorId, postId, {});

      expect(result).toEqual({ post: 'deleted', audiencesRemoved: 0 });
      expect(audienceModel.findAll).not.toHaveBeenCalled();
      expect(post.destroy).not.toHaveBeenCalled();
      expect(cloudinaryService.deleteByUrl).not.toHaveBeenCalled();
    });

    it('finishes the job when the post is alive but has zero active audiences', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'],
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      postModel.findOne.mockResolvedValue(post);
      // All audiences already soft-deleted.
      audienceModel.findAll.mockResolvedValue([
        makeAudience('g1', new Date()),
        makeAudience('g2', new Date()),
      ]);

      const result = await service.deletePost(authorId, postId, {});

      expect(post.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: '[deleted]', mediaUrls: null }),
        expect.anything(),
      );
      expect(post.destroy).toHaveBeenCalled();
      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledWith(
        'https://res.cloudinary.com/c/image/upload/v1/a.png',
      );
      expect(result).toEqual({ post: 'deleted', audiencesRemoved: 0 });
    });

    it('cascades comment tombstone + reaction delete when a post is fully destroyed', async () => {
      const post = {
        id: postId,
        authorId,
        deletedAt: null,
        mediaUrls: null,
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      postModel.findOne.mockResolvedValue(post);
      audienceModel.findAll.mockResolvedValue([makeAudience('g1')]);

      await service.deletePost(authorId, postId, {});

      // Comments tombstoned with [deleted] then soft-deleted.
      expect(commentModel.update).toHaveBeenCalledWith(
        { content: '[deleted]' },
        expect.objectContaining({ where: { postId } }),
      );
      expect(commentModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { postId } }),
      );
      // Reactions hard-deleted (no content to retain).
      expect(reactionModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { postId } }),
      );
    });
  });
});
