import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { ExerciseService } from './exercise.service';
import { Exercise } from './entities/exercise.entity';
import { ExerciseMuscle } from './entities/exercise-muscle.entity';
import { ExerciseEquipment } from './entities/exercise-equipment.entity';
import { ExerciseMedia } from './entities/exercise-media.entity';
import { Muscle } from './entities/muscle.entity';
import { Equipment } from './entities/equipment.entity';
import { User } from '../user/entities/user.entity';
import {
  ExerciseKind,
  ExerciseSource,
  ExerciseVisibility,
  MuscleRole,
} from './entities/exercise.enums';
import { SearchIndexService } from '../search/search-index.service';
import { NotificationService } from '../notification/notification.service';
import {
  fakeTx,
  makeSilentLogger,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke tests for ExerciseService. Two layers:
 *   1. Validation + ownership + visibility — pure-logic paths that
 *      would silently regress if touched.
 *   2. Happy-path transactions for create/fork/softDelete — assert the
 *      tx wrapper is called, the right ORM writes are issued, and the
 *      counter accounting is correct.
 *
 * Faceted list aggregation and the actual search-doc/notification
 * pipeline live in the seed + manual Swagger probe; mocking the include
 * shape end-to-end here would be more noise than signal.
 */
describe('ExerciseService (smoke — not exhaustive)', () => {
  let service: ExerciseService;

  const exerciseModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    increment: jest.fn(),
  };
  const exerciseMuscleModel = { bulkCreate: jest.fn(), destroy: jest.fn() };
  const exerciseEquipmentModel = { bulkCreate: jest.fn(), destroy: jest.fn() };
  const exerciseMediaModel = { bulkCreate: jest.fn(), destroy: jest.fn() };
  const muscleModel = { findAll: jest.fn() };
  const equipmentModel = { findAll: jest.fn() };
  const userModel = { findByPk: jest.fn() };
  const sequelize = {
    transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      Promise.resolve(cb(fakeTx)),
    ),
    query: jest.fn(),
    escape: jest.fn((v: string) => `'${v}'`),
  };
  const searchIndex = {
    upsertExercise: jest.fn().mockResolvedValue(undefined),
    removeIfExists: jest.fn().mockResolvedValue(undefined),
  };
  const notificationService = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  const meInstructor = { userId: 'me', isInstructor: true } as const;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ExerciseService,
        { provide: getModelToken(Exercise), useValue: exerciseModel },
        {
          provide: getModelToken(ExerciseMuscle),
          useValue: exerciseMuscleModel,
        },
        {
          provide: getModelToken(ExerciseEquipment),
          useValue: exerciseEquipmentModel,
        },
        {
          provide: getModelToken(ExerciseMedia),
          useValue: exerciseMediaModel,
        },
        { provide: getModelToken(Muscle), useValue: muscleModel },
        { provide: getModelToken(Equipment), useValue: equipmentModel },
        { provide: getModelToken(User), useValue: userModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: SearchIndexService, useValue: searchIndex },
        { provide: NotificationService, useValue: notificationService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = module.get(ExerciseService);
  });

  // ─── Browse gate (originally locked decision §19; lifted post-freestyle) ───

  describe('canClientBrowseCatalog', () => {
    it('returns true for an instructor without touching the DB', async () => {
      const result = await service.canClientBrowseCatalog(meInstructor);
      expect(result).toBe(true);
      expect(userModel.findByPk).not.toHaveBeenCalled();
      expect(sequelize.query).not.toHaveBeenCalled();
    });

    it('returns true for any signed-in client (gate lifted)', async () => {
      const result = await service.canClientBrowseCatalog({
        userId: 'u',
        isInstructor: false,
      });
      expect(result).toBe(true);
      // The gate now no-ops so we shouldn't hit the DB for it.
      expect(userModel.findByPk).not.toHaveBeenCalled();
      expect(sequelize.query).not.toHaveBeenCalled();
    });

    it('assertClientCanBrowse is now a no-op', async () => {
      await expect(
        service.assertClientCanBrowse({ userId: 'u', isInstructor: false }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Create validation (locked decision §20) ─────────────────────

  describe('create — muscle-role invariants', () => {
    const baseDto = {
      name: 'Test exercise',
      kind: ExerciseKind.Strength,
      muscles: [],
    };

    it('rejects an exercise with no PRIMARY muscle', async () => {
      await expect(
        service.create(
          {
            ...baseDto,
            muscles: [{ muscleId: 'm-1', role: MuscleRole.Secondary }],
          },
          'owner-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects more than 3 PRIMARY muscles', async () => {
      await expect(
        service.create(
          {
            ...baseDto,
            muscles: [
              { muscleId: 'm-1', role: MuscleRole.Primary },
              { muscleId: 'm-2', role: MuscleRole.Primary },
              { muscleId: 'm-3', role: MuscleRole.Primary },
              { muscleId: 'm-4', role: MuscleRole.Primary },
            ],
          },
          'owner-1',
        ),
      ).rejects.toThrow(/PRIMARY muscles/);
    });

    it('rejects duplicate (muscle, role) pairs', async () => {
      await expect(
        service.create(
          {
            ...baseDto,
            muscles: [
              { muscleId: 'm-1', role: MuscleRole.Primary },
              { muscleId: 'm-1', role: MuscleRole.Primary },
            ],
          },
          'owner-1',
        ),
      ).rejects.toThrow(/Duplicate/);
    });
  });

  // ─── Create happy path (T1) ──────────────────────────────────────

  describe('create — happy path', () => {
    it('wraps inserts in a single transaction and attaches muscle + equipment rows', async () => {
      // No slug collision on first lookup.
      exerciseModel.findOne.mockResolvedValueOnce(null);
      const created = {
        id: 'new-id',
        ownerId: 'owner-1',
        source: ExerciseSource.Instructor,
        visibility: ExerciseVisibility.Private,
      };
      exerciseModel.create.mockResolvedValueOnce(created);
      // reloadDetail at the end
      exerciseModel.findByPk.mockResolvedValueOnce({
        ...created,
        muscleRoles: [],
      });

      await service.create(
        {
          name: 'Tempo squat',
          kind: ExerciseKind.Strength,
          muscles: [{ muscleId: 'm-quads', role: MuscleRole.Primary }],
          equipmentIds: ['eq-kettlebell'],
        },
        'owner-1',
      );

      expect(sequelize.transaction).toHaveBeenCalledTimes(1);
      expect(exerciseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tempo squat',
          slug: 'tempo-squat',
          source: ExerciseSource.Instructor,
          ownerId: 'owner-1',
          visibility: ExerciseVisibility.Private,
          forkCount: 0,
        }),
        { transaction: fakeTx },
      );
      expect(exerciseMuscleModel.bulkCreate).toHaveBeenCalledWith(
        [
          {
            exerciseId: 'new-id',
            muscleId: 'm-quads',
            role: MuscleRole.Primary,
          },
        ],
        { transaction: fakeTx },
      );
      expect(exerciseEquipmentModel.bulkCreate).toHaveBeenCalledWith(
        [{ exerciseId: 'new-id', equipmentId: 'eq-kettlebell' }],
        { transaction: fakeTx },
      );
      expect(searchIndex.upsertExercise).toHaveBeenCalledWith('new-id');
    });
  });

  // ─── Update — ownership policy ───────────────────────────────────

  describe('update — ownership', () => {
    it('throws NotFound when the exercise does not exist', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce(null);

      await expect(
        service.update('missing', { name: 'X' }, meInstructor),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the exercise belongs to another instructor (hides existence)', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'e-1',
        source: ExerciseSource.Instructor,
        ownerId: 'other-owner',
      });

      await expect(
        service.update('e-1', { name: 'New name' }, meInstructor),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound on SYSTEM exercises (never editable via this surface)', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'e-sys',
        source: ExerciseSource.System,
        ownerId: null,
      });

      await expect(
        service.update('e-sys', { name: 'New name' }, meInstructor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findById visibility filter ──────────────────────────────────

  describe('findById — visibility filter', () => {
    it('hides a private exercise from a non-owner', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'e-1',
        source: ExerciseSource.Instructor,
        ownerId: 'other-owner',
        visibility: ExerciseVisibility.Private,
      });

      await expect(service.findById('e-1', meInstructor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns SYSTEM exercises to any caller', async () => {
      const sys = {
        id: 'e-sys',
        source: ExerciseSource.System,
        ownerId: null,
        visibility: ExerciseVisibility.Public,
      };
      exerciseModel.findByPk.mockResolvedValueOnce(sys);

      const result = await service.findById('e-sys', {
        userId: 'me',
        isInstructor: false,
      });
      expect(result).toBe(sys);
    });

    it('returns PUBLIC instructor exercises to other instructors', async () => {
      const pub = {
        id: 'e-pub',
        source: ExerciseSource.Instructor,
        ownerId: 'other-owner',
        visibility: ExerciseVisibility.Public,
      };
      exerciseModel.findByPk.mockResolvedValueOnce(pub);

      const result = await service.findById('e-pub', meInstructor);
      expect(result).toBe(pub);
    });
  });

  // ─── Fork preconditions + happy path + decrement (T3) ────────────

  describe('fork', () => {
    it('hides existence when the source is PRIVATE', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'src',
        ownerId: 'other',
        visibility: ExerciseVisibility.Private,
        muscleRoles: [],
        equipment: [],
      });

      await expect(service.fork('src', meInstructor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects forking your own exercise', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'src',
        ownerId: 'me',
        visibility: ExerciseVisibility.Public,
        muscleRoles: [],
        equipment: [],
      });

      await expect(service.fork('src', meInstructor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns 409 when the same instructor already has a live fork', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'src',
        ownerId: 'other',
        visibility: ExerciseVisibility.Public,
        muscleRoles: [],
        equipment: [],
      });
      exerciseModel.findOne.mockResolvedValueOnce({ id: 'existing-fork' });

      await expect(service.fork('src', meInstructor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('clones in a tx and increments source.fork_count (atomic), then re-reads for the notification body', async () => {
      const source = {
        id: 'src',
        ownerId: 'other-owner',
        visibility: ExerciseVisibility.Public,
        name: 'Source ex',
        slug: 'source-ex',
        description: null,
        instructions: null,
        kind: ExerciseKind.Strength,
        level: 'BEGINNER',
        movementPattern: null,
        mechanic: null,
        force: null,
        metValue: null,
        isUnilateral: false,
        mediaKind: 'NONE',
        thumbnailUrl: null,
        youtubeUrl: null,
        forkCount: 41,
        muscleRoles: [{ muscleId: 'm-1', role: MuscleRole.Primary }],
        equipment: [{ id: 'eq-1' }],
      };
      exerciseModel.findByPk
        .mockResolvedValueOnce(source) // initial load with includes
        .mockResolvedValueOnce({ forkCount: 42 }) // post-increment re-read
        .mockResolvedValueOnce({ id: 'fork-id' }); // reloadDetail
      exerciseModel.findOne.mockResolvedValueOnce(null); // no existing fork
      // Slug allocator findOne (also returns null for "no collision")
      exerciseModel.findOne.mockResolvedValueOnce(null);
      exerciseModel.create.mockResolvedValueOnce({ id: 'fork-id' });

      await service.fork('src', meInstructor);

      expect(exerciseModel.increment).toHaveBeenCalledWith(
        { forkCount: 1 },
        { where: { id: 'src' }, transaction: fakeTx },
      );
      // notification body uses the post-increment count (42), not the
      // stale local source.forkCount (41).
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('42 forks'),
        }),
      );
    });
  });

  // ─── Soft-delete — fork_count decrement (T3) ─────────────────────

  describe('softDelete', () => {
    it('throws NotFound when not the owner (hides existence)', async () => {
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'e-1',
        source: ExerciseSource.Instructor,
        ownerId: 'other',
      });

      await expect(service.softDelete('e-1', meInstructor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('decrements source.fork_count when the deleted row is a fork', async () => {
      const destroy = jest.fn().mockResolvedValue(undefined);
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'fork-id',
        source: ExerciseSource.Instructor,
        ownerId: 'me',
        forkedFromId: 'src-id',
        destroy,
      });

      await service.softDelete('fork-id', meInstructor);

      expect(destroy).toHaveBeenCalledWith({ transaction: fakeTx });
      expect(exerciseModel.increment).toHaveBeenCalledWith(
        { forkCount: -1 },
        expect.objectContaining({
          where: expect.objectContaining({ id: 'src-id' }),
          transaction: fakeTx,
        }),
      );
    });

    it('does NOT touch fork_count when the row is not a fork', async () => {
      const destroy = jest.fn().mockResolvedValue(undefined);
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'original',
        source: ExerciseSource.Instructor,
        ownerId: 'me',
        forkedFromId: null,
        destroy,
      });

      await service.softDelete('original', meInstructor);

      expect(destroy).toHaveBeenCalled();
      expect(exerciseModel.increment).not.toHaveBeenCalled();
    });
  });

  // ─── Slug allocator (T4) ─────────────────────────────────────────

  describe('slug allocation', () => {
    it("retries with '-2' / '-3' suffixes when the base slug is taken", async () => {
      exerciseModel.findOne
        .mockResolvedValueOnce({ id: 'collide-1' }) // 'tempo-squat' taken
        .mockResolvedValueOnce({ id: 'collide-2' }) // 'tempo-squat-2' taken
        .mockResolvedValueOnce(null); // 'tempo-squat-3' free
      exerciseModel.create.mockResolvedValueOnce({ id: 'new' });
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'new',
        muscleRoles: [],
      });

      await service.create(
        {
          name: 'Tempo squat',
          kind: ExerciseKind.Strength,
          muscles: [{ muscleId: 'm-1', role: MuscleRole.Primary }],
        },
        'owner-1',
      );

      expect(exerciseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'tempo-squat-3' }),
        expect.anything(),
      );
    });
  });
});
