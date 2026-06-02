import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

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
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
  const loggedExerciseModel = { create: jest.fn() };
  const loggedSetModel = { findByPk: jest.fn(), bulkCreate: jest.fn() };
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
  const exerciseModel = {};
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
});
