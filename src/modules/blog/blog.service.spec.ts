import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { BlogPost } from './entities/blog-post.entity';
import { BlogService } from './blog.service';
import { CloudinaryService } from '../../common/services/cloudinary.service';

/**
 * Smoke tests for BlogService — covers the surface the FE depends on:
 *   - create: XOR rule between authorUserId and guestAuthorName (only
 *     admins can publish under a guest byline)
 *   - findAllPublished: paginated PrimeNG-shaped response + filter shape
 *   - findBySlug: 404 hides an unpublished post (no existence leak)
 *   - findByIdForEdit: owner-or-admin gate on draft access
 *   - update: stamps publishedAt on first publish; purges replaced
 *     Cloudinary cover only AFTER the DB write
 *   - delete: 403 on cross-user, soft-delete + purge cover on owner
 */
describe('BlogService (smoke — not exhaustive)', () => {
  const me = 'me-user-id';
  const stranger = 'someone-else';

  let service: BlogService;

  // Build a row that quacks like a BlogPost (toJSON + helpers). Keeps
  // the test inline-typed and avoids touching production types.
  const makePost = (overrides: Record<string, unknown> = {}) => {
    const base = {
      id: 'p-1',
      slug: 'hello-world',
      title: 'Hello',
      excerpt: 'world',
      content: 'body',
      category: 'Tips',
      coverImage: null,
      authorUserId: me,
      guestAuthorName: null,
      readTime: 5,
      tags: null,
      language: 'en',
      isPublished: true,
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      author: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        avatarUrl: 'https://cdn/x.jpg',
      },
      update: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    return {
      ...base,
      toJSON() {
        // Mirror Sequelize: a shallow clone the service mutates with delete.
        return { ...base };
      },
    };
  };

  const blogPostModel = {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  };
  const cloudinaryService = {
    uploadImage: jest.fn(),
    deleteByUrl: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn(() => 'https://motionhive.fit'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: getModelToken(BlogPost), useValue: blogPostModel },
        { provide: CloudinaryService, useValue: cloudinaryService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(BlogService);
  });

  // ─── Wiring ──────────────────────────────────────────────────────

  it('wires up via the Nest test module', () => {
    expect(service).toBeDefined();
  });

  // ─── create — XOR (registered vs guest byline) ───────────────────

  describe('create', () => {
    const dto = {
      title: 'Hello',
      slug: 'hello',
      excerpt: 'x',
      content: 'body',
      category: 'Tips',
      isPublished: true,
    };

    it('registered post: stamps authorUserId from the caller and publishedAt on publish', async () => {
      const created = makePost({ id: 'p-new', isPublished: true });
      blogPostModel.create.mockResolvedValueOnce(created);
      blogPostModel.findByPk.mockResolvedValueOnce(created);

      const out = await service.create(dto, me, {
        userId: me,
        roles: ['WRITER'],
      });

      const createArg = blogPostModel.create.mock.calls[0][0];
      expect(createArg).toMatchObject({
        title: 'Hello',
        slug: 'hello',
        authorUserId: me,
        guestAuthorName: null,
      });
      expect(createArg.publishedAt).toBeInstanceOf(Date);
      expect(out.id).toBe('p-new');
      // Byline computed from the joined author.
      expect(out.authorName).toBe('Ada Lovelace');
      expect(out.authorInitials).toBe('AL');
    });

    it('rejects a non-admin trying to publish under a guest byline', async () => {
      await expect(
        service.create({ ...dto, guestAuthorName: 'Sarah J.' }, me, {
          userId: me,
          roles: ['WRITER'],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(blogPostModel.create).not.toHaveBeenCalled();
    });

    it('admin can publish a guest post: trims the byline, nulls authorUserId', async () => {
      const guestRow = makePost({
        id: 'p-guest',
        authorUserId: null,
        author: undefined,
        guestAuthorName: 'Sarah Johnson',
      });
      blogPostModel.create.mockResolvedValueOnce(guestRow);
      blogPostModel.findByPk.mockResolvedValueOnce(guestRow);

      const out = await service.create(
        { ...dto, guestAuthorName: '  Sarah Johnson  ' },
        me,
        { userId: me, roles: ['ADMIN'] },
      );

      expect(blogPostModel.create.mock.calls[0][0]).toMatchObject({
        guestAuthorName: 'Sarah Johnson',
        authorUserId: null,
      });
      expect(out.authorName).toBe('Sarah Johnson');
      expect(out.authorInitials).toBe('SJ');
      expect(out.authorAvatarUrl).toBeNull();
    });
  });

  // ─── findAllPublished — list shape + filter ──────────────────────

  describe('findAllPublished', () => {
    it('returns the PrimeNG-shaped paginated response and filters on isPublished', async () => {
      blogPostModel.findAndCountAll.mockResolvedValueOnce({
        rows: [makePost()],
        count: 1,
      });

      const out = await service.findAllPublished({
        page: 1,
        limit: 10,
        category: 'Tips',
        locale: 'en',
      });

      expect(out).toEqual(
        expect.objectContaining({ total: 1, page: 1, pageSize: 10 }),
      );
      expect(out.items).toHaveLength(1);
      const queryArg = blogPostModel.findAndCountAll.mock.calls[0][0];
      expect(queryArg.where).toEqual(
        expect.objectContaining({
          isPublished: true,
          language: 'en',
          category: 'Tips',
        }),
      );
    });
  });

  // ─── findBySlug — hides drafts ───────────────────────────────────

  describe('findBySlug', () => {
    it('404s when the slug exists only as a draft (filter is isPublished:true)', async () => {
      blogPostModel.findOne.mockResolvedValueOnce(null);
      await expect(service.findBySlug('not-yet-live')).rejects.toThrow(
        NotFoundException,
      );
      const queryArg = blogPostModel.findOne.mock.calls[0][0];
      expect(queryArg.where).toEqual(
        expect.objectContaining({
          slug: 'not-yet-live',
          language: 'en',
          isPublished: true,
        }),
      );
    });

    it('returns the public response on the happy path', async () => {
      blogPostModel.findOne.mockResolvedValueOnce(makePost());
      const out = await service.findBySlug('hello-world');
      expect(out.slug).toBe('hello-world');
      expect(out.authorName).toBe('Ada Lovelace');
    });
  });

  // ─── findByIdForEdit — owner-or-admin gate ───────────────────────

  describe('findByIdForEdit', () => {
    it('lets a WRITER reopen their own draft', async () => {
      blogPostModel.findByPk.mockResolvedValueOnce(
        makePost({ isPublished: false, publishedAt: null }),
      );
      const out = await service.findByIdForEdit('p-1', {
        userId: me,
        roles: ['WRITER'],
      });
      expect(out.id).toBe('p-1');
      expect(out.isPublished).toBe(false);
    });

    it("forbids a WRITER from opening someone else's draft", async () => {
      blogPostModel.findByPk.mockResolvedValueOnce(
        makePost({ authorUserId: stranger, isPublished: false }),
      );
      await expect(
        service.findByIdForEdit('p-1', { userId: me, roles: ['WRITER'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("admin can open anyone's draft", async () => {
      blogPostModel.findByPk.mockResolvedValueOnce(
        makePost({ authorUserId: stranger, isPublished: false }),
      );
      const out = await service.findByIdForEdit('p-1', {
        userId: me,
        roles: ['ADMIN'],
      });
      expect(out.id).toBe('p-1');
    });
  });

  // ─── update — first-publish + cover purge ────────────────────────

  describe('update', () => {
    it('stamps publishedAt on first publish (was draft → published)', async () => {
      const draft = makePost({ isPublished: false, publishedAt: null });
      blogPostModel.findByPk.mockResolvedValueOnce(draft);
      // Reload after update.
      blogPostModel.findByPk.mockResolvedValueOnce(
        makePost({ isPublished: true }),
      );

      await service.update(
        'p-1',
        { isPublished: true },
        { userId: me, roles: ['WRITER'] },
      );

      const patch = draft.update.mock.calls[0][0];
      expect(patch.isPublished).toBe(true);
      expect(patch.publishedAt).toBeInstanceOf(Date);
    });

    it('purges the previous Cloudinary cover when coverImage is replaced', async () => {
      const post = makePost({ coverImage: 'https://cdn/old.jpg' });
      blogPostModel.findByPk.mockResolvedValueOnce(post);
      blogPostModel.findByPk.mockResolvedValueOnce(post);

      await service.update(
        'p-1',
        { coverImage: 'https://cdn/new.jpg' },
        { userId: me, roles: ['WRITER'] },
      );

      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledWith(
        'https://cdn/old.jpg',
      );
    });

    it("forbids a WRITER from editing another author's post", async () => {
      const someoneElses = makePost({ authorUserId: stranger });
      blogPostModel.findByPk.mockResolvedValueOnce(someoneElses);

      await expect(
        service.update(
          'p-1',
          { title: 'attempt' },
          { userId: me, roles: ['WRITER'] },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(someoneElses.update).not.toHaveBeenCalled();
    });

    it('refuses to clear an existing guestAuthorName via empty string', async () => {
      blogPostModel.findByPk.mockResolvedValueOnce(makePost());
      await expect(
        service.update(
          'p-1',
          { guestAuthorName: '   ' },
          { userId: me, roles: ['ADMIN'] },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── delete — owner-or-admin + cover purge ───────────────────────

  describe('delete', () => {
    it('soft-deletes an owned post and purges the cover', async () => {
      const post = makePost({ coverImage: 'https://cdn/old.jpg' });
      blogPostModel.findByPk.mockResolvedValueOnce(post);

      await service.delete('p-1', { userId: me, roles: ['WRITER'] });

      expect(post.destroy).toHaveBeenCalledTimes(1);
      expect(cloudinaryService.deleteByUrl).toHaveBeenCalledWith(
        'https://cdn/old.jpg',
      );
    });

    it("forbids a WRITER from deleting someone else's post", async () => {
      const someoneElses = makePost({ authorUserId: stranger });
      blogPostModel.findByPk.mockResolvedValueOnce(someoneElses);

      await expect(
        service.delete('p-1', { userId: me, roles: ['WRITER'] }),
      ).rejects.toThrow(ForbiddenException);
      expect(someoneElses.destroy).not.toHaveBeenCalled();
      expect(cloudinaryService.deleteByUrl).not.toHaveBeenCalled();
    });
  });
});
