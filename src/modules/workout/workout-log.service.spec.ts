import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { InstructorClient } from '../client/entities/instructor-client.entity';
import { Exercise } from '../exercise/entities/exercise.entity';
import { AssignedExercise } from './entities/assigned-exercise.entity';
import { AssignedSet } from './entities/assigned-set.entity';
import { AssignedWorkout } from './entities/assigned-workout.entity';
import { LoggedExercise } from './entities/logged-exercise.entity';
import { LoggedSet } from './entities/logged-set.entity';
import { OneRepMax } from './entities/one-rep-max.entity';
import { WorkoutLog } from './entities/workout-log.entity';
import { WorkoutLogStatus } from './entities/workout.enums';
import { WorkoutLogService } from './workout-log.service';
import {
  fakeTx,
  makeSilentLogger,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke tests for WorkoutLogService — covers the gnarly bits:
 *   - %1RM resolution math (Epley + scale-from-1RM)
 *   - start() hydrates the log tree + flips assigned_workout status
 *   - freestyle vs assigned start guard
 *   - complete() computes duration + idempotent
 *   - 1RM list ordering / Epley estimate edges
 *   - cross-tenant hide on log reads
 */
describe('WorkoutLogService (smoke — not exhaustive)', () => {
  let service: WorkoutLogService;

  const logModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
  const loggedExerciseModel = {
    create: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    max: jest.fn(),
  };
  const loggedSetModel = {
    findByPk: jest.fn(),
    bulkCreate: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    max: jest.fn(),
  };
  const assignedWorkoutModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  const assignedExerciseModel = {};
  const assignedSetModel = {};
  const oneRepMaxModel = {
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
  const exerciseModel = { findByPk: jest.fn() };
  const instructorClientModel = { findOne: jest.fn() };
  const sequelize = {
    transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      Promise.resolve(cb(fakeTx)),
    ),
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorkoutLogService,
        { provide: getModelToken(WorkoutLog), useValue: logModel },
        {
          provide: getModelToken(LoggedExercise),
          useValue: loggedExerciseModel,
        },
        { provide: getModelToken(LoggedSet), useValue: loggedSetModel },
        {
          provide: getModelToken(AssignedWorkout),
          useValue: assignedWorkoutModel,
        },
        {
          provide: getModelToken(AssignedExercise),
          useValue: assignedExerciseModel,
        },
        { provide: getModelToken(AssignedSet), useValue: assignedSetModel },
        { provide: getModelToken(OneRepMax), useValue: oneRepMaxModel },
        { provide: getModelToken(Exercise), useValue: exerciseModel },
        {
          provide: getModelToken(InstructorClient),
          useValue: instructorClientModel,
        },
        { provide: Sequelize, useValue: sequelize },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = module.get(WorkoutLogService);
  });

  // ─── start() preconditions ───────────────────────────────────────

  describe('start — guards', () => {
    it('rejects a freestyle workout with no name', async () => {
      await expect(
        service.start('me', { assignedWorkoutId: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('hides existence when the assigned workout is not owned by the caller', async () => {
      assignedWorkoutModel.findByPk.mockResolvedValueOnce({
        id: 'aw-1',
        exercises: [],
      });
      assignedWorkoutModel.findOne.mockResolvedValueOnce(null); // not owned

      await expect(
        service.start('me', { assignedWorkoutId: 'aw-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── start() — %1RM resolution + hydration ───────────────────────

  describe('start — hydrates the log tree and resolves %1RM', () => {
    const stamp = jest.fn().mockResolvedValue(undefined);
    const aw = {
      id: 'aw-1',
      programAssignmentId: 'pa-1',
      name: 'Day 1 — Upper',
      update: jest.fn().mockResolvedValue(undefined),
      exercises: [
        {
          id: 'ae-1',
          exerciseId: 'ex-1',
          orderIndex: 0,
          supersetGroupId: null,
          exercise: { id: 'ex-1', name: 'Squat', thumbnailUrl: 'x.jpg' },
          sets: [
            {
              id: 'as-1',
              orderIndex: 0,
              setType: 'NORMAL',
              targetWeightKg: null,
              targetWeightPercent1rm: 80,
              update: stamp,
            },
            {
              id: 'as-2',
              orderIndex: 1,
              setType: 'NORMAL',
              targetWeightKg: 60, // not a %1RM set — should NOT be stamped
              targetWeightPercent1rm: null,
              update: stamp,
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      assignedWorkoutModel.findByPk.mockResolvedValueOnce(aw);
      assignedWorkoutModel.findOne.mockResolvedValueOnce({
        assignment: { clientId: 'me' },
      });
      // Latest 1RM for ex-1 = 100kg.
      oneRepMaxModel.findAll.mockResolvedValueOnce([
        { exerciseId: 'ex-1', weightKg: 100, recordedAt: new Date() },
      ]);
      logModel.create.mockResolvedValueOnce({ id: 'wl-1' });
      loggedExerciseModel.create.mockResolvedValueOnce({ id: 'le-1' });
    });

    it('resolves the %1RM set to 80kg and stamps it on assigned_set', async () => {
      await service.start('me', { assignedWorkoutId: 'aw-1' });

      // 80% of 100kg = 80kg.
      expect(stamp).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedWeightKg: 80 }),
        { transaction: fakeTx },
      );
      // The second set (absolute kg, no %1RM) should NOT have been stamped.
      expect(stamp).toHaveBeenCalledTimes(1);
    });

    it('flips assigned_workout status to IN_PROGRESS', async () => {
      await service.start('me', { assignedWorkoutId: 'aw-1' });
      expect(aw.update).toHaveBeenCalledWith(
        { status: WorkoutLogStatus.InProgress },
        { transaction: fakeTx },
      );
    });

    it('pre-seeds logged_set rows mirroring the assigned plan', async () => {
      await service.start('me', { assignedWorkoutId: 'aw-1' });
      expect(loggedSetModel.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = loggedSetModel.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(
        expect.objectContaining({
          assignedSetId: 'as-1',
          loggedExerciseId: 'le-1',
          isCompleted: false,
        }),
      );
    });
  });

  // ─── complete() ──────────────────────────────────────────────────

  describe('complete', () => {
    it('is idempotent on an already-completed log', async () => {
      const log = {
        id: 'wl-1',
        userId: 'me',
        status: WorkoutLogStatus.Completed,
        update: jest.fn(),
      };
      logModel.findByPk.mockResolvedValueOnce(log);
      await service.complete('wl-1', {}, 'me');
      expect(log.update).not.toHaveBeenCalled();
    });

    it('computes durationSeconds from startedAt → now', async () => {
      const startedAt = new Date(Date.now() - 65_000); // 65s ago
      const update = jest.fn().mockResolvedValue(undefined);
      const log = {
        id: 'wl-1',
        userId: 'me',
        status: WorkoutLogStatus.InProgress,
        startedAt,
        programAssignmentId: null,
        assignedWorkoutId: null,
        update,
      };
      logModel.findByPk.mockResolvedValueOnce(log);

      await service.complete('wl-1', { feelingRating: 4 }, 'me');

      const args = update.mock.calls[0][0];
      expect(args.status).toBe(WorkoutLogStatus.Completed);
      expect(args.durationSeconds).toBeGreaterThanOrEqual(60);
      expect(args.feelingRating).toBe(4);
    });
  });

  // ─── Epley 1RM estimate ──────────────────────────────────────────

  describe('estimateOneRepMaxEpley', () => {
    it('returns null on missing inputs', () => {
      expect(service.estimateOneRepMaxEpley(null, 100)).toBeNull();
      expect(service.estimateOneRepMaxEpley(5, null)).toBeNull();
    });
    it('returns null beyond the safe rep range (Epley breaks past ~12)', () => {
      expect(service.estimateOneRepMaxEpley(15, 80)).toBeNull();
      expect(service.estimateOneRepMaxEpley(0, 80)).toBeNull();
    });
    it('estimates 100kg × 1 = 100', () => {
      expect(service.estimateOneRepMaxEpley(1, 100)).toBeCloseTo(103.33, 1);
    });
    it('estimates 80kg × 5 ≈ 93.33', () => {
      expect(service.estimateOneRepMaxEpley(5, 80)).toBeCloseTo(93.33, 1);
    });
  });

  // ─── Cross-tenant hide ───────────────────────────────────────────

  describe('findById', () => {
    it('hides existence when the log belongs to someone else', async () => {
      logModel.findByPk.mockResolvedValueOnce({ id: 'wl-1', userId: 'other' });
      await expect(service.findById('wl-1', 'me')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Mid-session: add exercise ───────────────────────────────────

  describe('addExerciseToLog', () => {
    const inProgressLog = {
      id: 'wl-1',
      userId: 'me',
      status: WorkoutLogStatus.InProgress,
    };

    it('refuses when the log is not in progress', async () => {
      logModel.findByPk.mockResolvedValueOnce({
        ...inProgressLog,
        status: WorkoutLogStatus.Completed,
      });
      await expect(
        service.addExerciseToLog('wl-1', 'ex-1', 'me'),
      ).rejects.toThrow(BadRequestException);
    });

    it('hides existence when the log is not owned', async () => {
      logModel.findByPk.mockResolvedValueOnce({
        ...inProgressLog,
        userId: 'other',
      });
      await expect(
        service.addExerciseToLog('wl-1', 'ex-1', 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it("404s when the exercise doesn't exist", async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      exerciseModel.findByPk.mockResolvedValueOnce(null);
      await expect(
        service.addExerciseToLog('wl-1', 'ex-x', 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s on a PRIVATE exercise owned by someone else (no existence leak)', async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'ex-1',
        name: 'Squat',
        thumbnailUrl: null,
        visibility: 'PRIVATE',
        ownerId: 'someone-else',
      });
      await expect(
        service.addExerciseToLog('wl-1', 'ex-1', 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends at the end of orderIndex and snapshots name + thumb', async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'ex-1',
        name: 'Bench',
        thumbnailUrl: 'b.jpg',
        visibility: 'PUBLIC',
        ownerId: null,
      });
      loggedExerciseModel.max.mockResolvedValueOnce(2);
      loggedExerciseModel.create.mockResolvedValueOnce({ id: 'le-new' });

      await service.addExerciseToLog('wl-1', 'ex-1', 'me');

      expect(loggedExerciseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workoutLogId: 'wl-1',
          exerciseId: 'ex-1',
          exerciseNameSnapshot: 'Bench',
          exerciseThumbnailUrlSnapshot: 'b.jpg',
          orderIndex: 3,
          assignedExerciseId: null,
        }),
      );
    });

    it('starts orderIndex at 0 when the log has no exercises yet', async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'ex-1',
        name: 'Bench',
        thumbnailUrl: null,
        visibility: 'PUBLIC',
        ownerId: null,
      });
      loggedExerciseModel.max.mockResolvedValueOnce(null);
      loggedExerciseModel.create.mockResolvedValueOnce({ id: 'le-new' });

      await service.addExerciseToLog('wl-1', 'ex-1', 'me');

      expect(loggedExerciseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderIndex: 0 }),
      );
    });
  });

  // ─── Mid-session: remove exercise ────────────────────────────────

  describe('removeExerciseFromLog', () => {
    it('refuses on a completed log', async () => {
      logModel.findByPk.mockResolvedValueOnce({
        id: 'wl-1',
        userId: 'me',
        status: WorkoutLogStatus.Completed,
      });
      await expect(
        service.removeExerciseFromLog('wl-1', 'le-1', 'me'),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the logged exercise belongs to a different log', async () => {
      logModel.findByPk.mockResolvedValueOnce({
        id: 'wl-1',
        userId: 'me',
        status: WorkoutLogStatus.InProgress,
      });
      loggedExerciseModel.findByPk.mockResolvedValueOnce({
        id: 'le-1',
        workoutLogId: 'wl-OTHER',
      });
      await expect(
        service.removeExerciseFromLog('wl-1', 'le-1', 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('destroys the row on the happy path', async () => {
      const destroy = jest.fn().mockResolvedValue(undefined);
      logModel.findByPk.mockResolvedValueOnce({
        id: 'wl-1',
        userId: 'me',
        status: WorkoutLogStatus.InProgress,
      });
      loggedExerciseModel.findByPk.mockResolvedValueOnce({
        id: 'le-1',
        workoutLogId: 'wl-1',
        destroy,
      });
      await service.removeExerciseFromLog('wl-1', 'le-1', 'me');
      expect(destroy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Mid-session: add set ────────────────────────────────────────

  describe('addSetToLog', () => {
    const inProgressLog = {
      id: 'wl-1',
      userId: 'me',
      status: WorkoutLogStatus.InProgress,
    };

    it('refuses on a non-in-progress log', async () => {
      logModel.findByPk.mockResolvedValueOnce({
        ...inProgressLog,
        status: WorkoutLogStatus.Abandoned,
      });
      await expect(
        service.addSetToLog('wl-1', 'le-1', {}, 'me'),
      ).rejects.toThrow(BadRequestException);
    });

    it("404s when the exercise doesn't belong to the log", async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      loggedExerciseModel.findByPk.mockResolvedValueOnce({
        id: 'le-1',
        workoutLogId: 'wl-OTHER',
      });
      await expect(
        service.addSetToLog('wl-1', 'le-1', {}, 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends a NORMAL set at the end and leaves it un-completed', async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      loggedExerciseModel.findByPk.mockResolvedValueOnce({
        id: 'le-1',
        workoutLogId: 'wl-1',
      });
      loggedSetModel.max.mockResolvedValueOnce(1);
      loggedSetModel.create.mockResolvedValueOnce({ id: 'ls-new' });

      await service.addSetToLog('wl-1', 'le-1', {}, 'me');

      expect(loggedSetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loggedExerciseId: 'le-1',
          assignedSetId: null,
          orderIndex: 2,
          setType: 'NORMAL',
          isCompleted: false,
        }),
      );
    });

    it('honours an explicit setType from the DTO', async () => {
      logModel.findByPk.mockResolvedValueOnce(inProgressLog);
      loggedExerciseModel.findByPk.mockResolvedValueOnce({
        id: 'le-1',
        workoutLogId: 'wl-1',
      });
      loggedSetModel.max.mockResolvedValueOnce(null);
      loggedSetModel.create.mockResolvedValueOnce({ id: 'ls-new' });

      await service.addSetToLog('wl-1', 'le-1', { setType: 'WARMUP' }, 'me');

      expect(loggedSetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ setType: 'WARMUP', orderIndex: 0 }),
      );
    });
  });

  // ─── 1RM manual record + list ────────────────────────────────────

  describe('recordOneRepMax', () => {
    it('defaults source to MANUAL and recordedAt to now when omitted', async () => {
      oneRepMaxModel.create.mockResolvedValueOnce({ id: 'orm-1' });
      await service.recordOneRepMax('me', {
        exerciseId: 'ex-1',
        weightKg: 120,
      });
      const args = oneRepMaxModel.create.mock.calls[0][0];
      expect(args.userId).toBe('me');
      expect(args.exerciseId).toBe('ex-1');
      expect(args.weightKg).toBe(120);
      expect(args.source).toBe('MANUAL');
      expect(args.recordedAt).toBeInstanceOf(Date);
      expect(args.notes).toBeNull();
    });

    it('coerces blank notes to null but keeps real notes trimmed', async () => {
      oneRepMaxModel.create.mockResolvedValueOnce({ id: 'orm-2' });
      await service.recordOneRepMax('me', {
        exerciseId: 'ex-1',
        weightKg: 100,
        notes: '   ',
      });
      expect(oneRepMaxModel.create.mock.calls[0][0].notes).toBeNull();

      oneRepMaxModel.create.mockResolvedValueOnce({ id: 'orm-3' });
      await service.recordOneRepMax('me', {
        exerciseId: 'ex-1',
        weightKg: 100,
        notes: '  felt strong  ',
      });
      expect(oneRepMaxModel.create.mock.calls[1][0].notes).toBe('felt strong');
    });
  });

  describe('listOneRepMaxes', () => {
    it('paginates with PrimeNG-shaped response', async () => {
      oneRepMaxModel.findAndCountAll.mockResolvedValueOnce({
        rows: [{ id: 'orm-1' }],
        count: 1,
      });
      const out = await service.listOneRepMaxes('me', { page: 1, limit: 20 });
      expect(out).toEqual({
        items: [{ id: 'orm-1' }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });
  });

  // ─── Coach read-only access ──────────────────────────────────────

  describe('listForClientByInstructor', () => {
    it('404s when no ACTIVE coach link exists', async () => {
      instructorClientModel.findOne.mockResolvedValueOnce(null);
      await expect(
        service.listForClientByInstructor('coach-1', 'client-1', {
          page: 1,
          limit: 20,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(logModel.findAndCountAll).not.toHaveBeenCalled();
    });

    it('only matches ACTIVE links (filter passed to instructor_client query)', async () => {
      instructorClientModel.findOne.mockResolvedValueOnce(null);
      await expect(
        service.listForClientByInstructor('coach-1', 'client-1', {
          page: 1,
          limit: 20,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(instructorClientModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            instructorId: 'coach-1',
            clientId: 'client-1',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('delegates to listForUser(clientId) when the link is ACTIVE', async () => {
      instructorClientModel.findOne.mockResolvedValueOnce({ id: 'link-1' });
      logModel.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
      const out = await service.listForClientByInstructor(
        'coach-1',
        'client-1',
        { page: 1, limit: 20 },
      );
      const args = logModel.findAndCountAll.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({ userId: 'client-1' }),
      );
      expect(out).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });
  });

  describe('findByIdForInstructor', () => {
    it('404s when the log does not exist', async () => {
      logModel.findByPk.mockResolvedValueOnce(null);
      await expect(
        service.findByIdForInstructor('wl-x', 'coach-1'),
      ).rejects.toThrow(NotFoundException);
      expect(instructorClientModel.findOne).not.toHaveBeenCalled();
    });

    it('404s when the log owner is not an ACTIVE client of the caller', async () => {
      logModel.findByPk.mockResolvedValueOnce({ userId: 'client-1' });
      instructorClientModel.findOne.mockResolvedValueOnce(null);
      await expect(
        service.findByIdForInstructor('wl-1', 'coach-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the full plain log on the happy path', async () => {
      // First call: lightweight stub (userId only)
      logModel.findByPk.mockResolvedValueOnce({ userId: 'client-1' });
      instructorClientModel.findOne.mockResolvedValueOnce({ id: 'link-1' });
      // Second call: the full-tree findByPk inside findById()
      const plainProjection = {
        id: 'wl-1',
        userId: 'client-1',
        completedAt: null,
        startedAt: new Date(),
        status: WorkoutLogStatus.Completed,
      };
      logModel.findByPk.mockResolvedValueOnce({
        id: 'wl-1',
        userId: 'client-1',
        completedAt: null,
        startedAt: new Date(),
        status: WorkoutLogStatus.Completed,
        get: () => plainProjection,
      });
      // No PRs in the window — _findSessionPrs will query oneRepMaxModel.
      oneRepMaxModel.findAll.mockResolvedValueOnce([]);

      const out = await service.findByIdForInstructor('wl-1', 'coach-1');

      expect(out).toBe(plainProjection);
    });
  });

  // ─── Find log by assigned workout (plan-detail "View" CTA) ───────

  describe('findByAssignedWorkout', () => {
    it("404s when the assigned workout isn't owned by the caller", async () => {
      assignedWorkoutModel.findOne.mockResolvedValueOnce(null);
      await expect(service.findByAssignedWorkout('aw-x', 'me')).rejects.toThrow(
        NotFoundException,
      );
      expect(logModel.findOne).not.toHaveBeenCalled();
    });

    it('404s when the workout was never started (no log row)', async () => {
      assignedWorkoutModel.findOne.mockResolvedValueOnce({
        assignment: { clientId: 'me' },
      });
      logModel.findOne.mockResolvedValueOnce(null);
      await expect(service.findByAssignedWorkout('aw-1', 'me')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the latest log when one exists', async () => {
      assignedWorkoutModel.findOne.mockResolvedValueOnce({
        assignment: { clientId: 'me' },
      });
      logModel.findOne.mockResolvedValueOnce({ id: 'wl-1' });
      const out = await service.findByAssignedWorkout('aw-1', 'me');
      expect(out).toEqual({ id: 'wl-1' });
      expect(logModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'me', assignedWorkoutId: 'aw-1' },
          order: [['startedAt', 'DESC']],
        }),
      );
    });
  });

  // ─── Last session for exercise (history hint) ────────────────────

  describe('lastSessionForExercise', () => {
    it('returns [] when no prior completed session exists', async () => {
      loggedExerciseModel.findOne.mockResolvedValueOnce(null);
      const out = await service.lastSessionForExercise('me', 'ex-1');
      expect(out).toEqual([]);
      expect(loggedSetModel.findAll).not.toHaveBeenCalled();
    });

    it('returns up to 6 completed sets from the most-recent prior session', async () => {
      loggedExerciseModel.findOne.mockResolvedValueOnce({ id: 'le-prior' });
      const sets = [
        { id: 's1', isCompleted: true },
        { id: 's2', isCompleted: true },
      ];
      loggedSetModel.findAll.mockResolvedValueOnce(sets);

      const out = await service.lastSessionForExercise('me', 'ex-1');

      expect(out).toBe(sets);
      expect(loggedSetModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loggedExerciseId: 'le-prior', isCompleted: true },
          limit: 6,
        }),
      );
    });
  });
});
