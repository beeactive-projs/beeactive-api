import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { Exercise } from '../exercise/entities/exercise.entity';
import { LoggedExercise } from '../workout/entities/logged-exercise.entity';
import { LoggedSet } from '../workout/entities/logged-set.entity';
import { WorkoutLog } from '../workout/entities/workout-log.entity';
import { Routine } from './entities/routine.entity';
import { RoutineExercise } from './entities/routine-exercise.entity';
import { RoutineService } from './routine.service';

/**
 * Smoke tests focused on the behaviour the FE depends on:
 *   - create: validates + seeds exercises atomically
 *   - findById / update / delete: 404 on cross-user access (hides existence)
 *   - update with exercises[]: replaces the routine_exercise rows wholesale
 *   - startAsWorkoutLog: creates a freestyle log + seeds N empty set rows
 *     per exercise + bumps last_performed_at
 */
describe('RoutineService', () => {
  const me = 'me-user-id';
  const stranger = 'someone-else';

  let service: RoutineService;

  // Mock models
  const routineModel = {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
  };
  const routineExerciseModel = {
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    findAll: jest.fn(),
  };
  const exerciseModel = {
    count: jest.fn(),
  };
  const logModel = {
    create: jest.fn(),
  };
  const loggedExerciseModel = {
    create: jest.fn(),
  };
  const loggedSetModel = {
    bulkCreate: jest.fn(),
  };
  const sequelize = {
    transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({}),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        RoutineService,
        { provide: getModelToken(Routine), useValue: routineModel },
        {
          provide: getModelToken(RoutineExercise),
          useValue: routineExerciseModel,
        },
        { provide: getModelToken(Exercise), useValue: exerciseModel },
        { provide: getModelToken(WorkoutLog), useValue: logModel },
        {
          provide: getModelToken(LoggedExercise),
          useValue: loggedExerciseModel,
        },
        { provide: getModelToken(LoggedSet), useValue: loggedSetModel },
        { provide: Sequelize, useValue: sequelize },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(RoutineService);
  });

  // ───── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('persists a name-only routine, no exercises seeded', async () => {
      routineModel.create.mockResolvedValueOnce({
        id: 'r-1',
        userId: me,
        name: 'Push',
      });
      // The follow-up _loadFull call
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-1',
        userId: me,
        name: 'Push',
      });

      const out = await service.create(me, { name: 'Push' });

      expect(routineModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: me, name: 'Push' }),
        expect.anything(),
      );
      expect(routineExerciseModel.bulkCreate).not.toHaveBeenCalled();
      expect(out.id).toBe('r-1');
    });

    it('seeds exercises atomically inside the create tx', async () => {
      routineModel.create.mockResolvedValueOnce({ id: 'r-2' });
      exerciseModel.count.mockResolvedValueOnce(2);
      routineExerciseModel.bulkCreate.mockResolvedValueOnce([]);
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-2',
        userId: me,
      });

      await service.create(me, {
        name: 'Legs',
        exercises: [
          { exerciseId: 'ex-1', defaultSets: 4, targetWeightKg: 80 },
          { exerciseId: 'ex-2', defaultSets: 3 },
        ],
      });

      expect(exerciseModel.count).toHaveBeenCalled();
      const seedArg = routineExerciseModel.bulkCreate.mock.calls[0][0];
      expect(seedArg).toHaveLength(2);
      expect(seedArg[0]).toMatchObject({
        routineId: 'r-2',
        exerciseId: 'ex-1',
        orderIndex: 0,
        defaultSets: 4,
        targetWeightKg: 80,
      });
      expect(seedArg[1]).toMatchObject({
        exerciseId: 'ex-2',
        orderIndex: 1,
        defaultSets: 3,
      });
    });

    it('rejects when an exercise id does not exist', async () => {
      routineModel.create.mockResolvedValueOnce({ id: 'r-3' });
      exerciseModel.count.mockResolvedValueOnce(1); // only 1 of 2 found

      await expect(
        service.create(me, {
          name: 'Bad',
          exercises: [{ exerciseId: 'ex-real' }, { exerciseId: 'ex-fake' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───── findById / hidden cross-user ───────────────────────────────

  describe('findById', () => {
    it('returns the routine when the caller owns it', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-x',
        userId: me,
      });
      const r = await service.findById(me, 'r-x');
      expect(r.id).toBe('r-x');
    });

    it('404s on cross-user access (hides existence)', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-x',
        userId: stranger,
      });
      await expect(service.findById(me, 'r-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the routine does not exist at all', async () => {
      routineModel.findByPk.mockResolvedValueOnce(null);
      await expect(service.findById(me, 'r-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───── update (wholesale replace of exercises) ────────────────────

  describe('update', () => {
    it('replaces exercises wholesale when the field is included', async () => {
      const update = jest.fn();
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-u',
        userId: me,
        update,
      });
      exerciseModel.count.mockResolvedValueOnce(1);
      // _loadFull after the tx
      routineModel.findByPk.mockResolvedValueOnce({ id: 'r-u', userId: me });

      await service.update(me, 'r-u', {
        name: 'Renamed',
        exercises: [{ exerciseId: 'ex-1' }],
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed' }),
        expect.anything(),
      );
      expect(routineExerciseModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { routineId: 'r-u' } }),
      );
      expect(routineExerciseModel.bulkCreate).toHaveBeenCalled();
    });

    it('leaves exercises untouched when the field is omitted', async () => {
      const update = jest.fn();
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-u',
        userId: me,
        update,
      });
      routineModel.findByPk.mockResolvedValueOnce({ id: 'r-u', userId: me });

      await service.update(me, 'r-u', { notes: 'Updated notes only.' });

      expect(routineExerciseModel.destroy).not.toHaveBeenCalled();
      expect(routineExerciseModel.bulkCreate).not.toHaveBeenCalled();
    });

    it('404s on cross-user', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-u',
        userId: stranger,
        update: jest.fn(),
      });
      await expect(
        service.update(me, 'r-u', { name: 'attempt' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───── softDelete ─────────────────────────────────────────────────

  describe('softDelete', () => {
    it('destroys an owned routine', async () => {
      const destroy = jest.fn();
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-d',
        userId: me,
        destroy,
      });
      await service.softDelete(me, 'r-d');
      expect(destroy).toHaveBeenCalled();
    });

    it('404s on cross-user', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-d',
        userId: stranger,
        destroy: jest.fn(),
      });
      await expect(service.softDelete(me, 'r-d')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───── startAsWorkoutLog ──────────────────────────────────────────

  describe('startAsWorkoutLog', () => {
    it('creates a freestyle log + seeds N empty sets per exercise + bumps last_performed_at', async () => {
      const update = jest.fn();
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-s',
        userId: me,
        name: 'Push day',
        update,
      });
      routineExerciseModel.findAll.mockResolvedValueOnce([
        {
          id: 'rx-1',
          routineId: 'r-s',
          exerciseId: 'ex-1',
          orderIndex: 0,
          supersetGroupId: null,
          notes: null,
          defaultSets: 4,
          exercise: { name: 'Bench', thumbnailUrl: null },
        },
        {
          id: 'rx-2',
          routineId: 'r-s',
          exerciseId: 'ex-2',
          orderIndex: 1,
          supersetGroupId: null,
          notes: null,
          defaultSets: 3,
          exercise: { name: 'OHP', thumbnailUrl: null },
        },
      ]);
      logModel.create.mockResolvedValueOnce({ id: 'log-1' });
      loggedExerciseModel.create
        .mockResolvedValueOnce({ id: 'le-1' })
        .mockResolvedValueOnce({ id: 'le-2' });
      loggedSetModel.bulkCreate.mockResolvedValue([]);

      const out = await service.startAsWorkoutLog(me, 'r-s');

      expect(out.id).toBe('log-1');
      expect(logModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: me,
          programAssignmentId: null,
          assignedWorkoutId: null,
          name: 'Push day',
          status: 'IN_PROGRESS',
        }),
        expect.anything(),
      );
      // Two logged-exercise rows
      expect(loggedExerciseModel.create).toHaveBeenCalledTimes(2);
      expect(loggedExerciseModel.create.mock.calls[0][0]).toMatchObject({
        workoutLogId: 'log-1',
        exerciseId: 'ex-1',
        exerciseNameSnapshot: 'Bench',
        orderIndex: 0,
      });
      // Set seeds: 4 + 3 = two bulkCreate calls of length 4 and 3
      expect(loggedSetModel.bulkCreate).toHaveBeenCalledTimes(2);
      const firstBulk = loggedSetModel.bulkCreate.mock.calls[0][0];
      expect(firstBulk).toHaveLength(4);
      expect(firstBulk[0]).toMatchObject({
        loggedExerciseId: 'le-1',
        orderIndex: 0,
        setType: 'NORMAL',
        isCompleted: false,
      });
      const secondBulk = loggedSetModel.bulkCreate.mock.calls[1][0];
      expect(secondBulk).toHaveLength(3);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ lastPerformedAt: expect.any(Date) }),
      );
    });

    it('clamps defaultSets to ≥ 1 (guards against bad data)', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-z',
        userId: me,
        name: 'Edge',
        update: jest.fn(),
      });
      routineExerciseModel.findAll.mockResolvedValueOnce([
        {
          id: 'rx-z',
          routineId: 'r-z',
          exerciseId: 'ex-1',
          orderIndex: 0,
          defaultSets: 0, // ← shouldn't happen via DTO but defend anyway
          exercise: { name: 'X', thumbnailUrl: null },
        },
      ]);
      logModel.create.mockResolvedValueOnce({ id: 'log-z' });
      loggedExerciseModel.create.mockResolvedValueOnce({ id: 'le-z' });
      loggedSetModel.bulkCreate.mockResolvedValue([]);

      await service.startAsWorkoutLog(me, 'r-z');

      expect(loggedSetModel.bulkCreate.mock.calls[0][0]).toHaveLength(1);
    });

    it('404s on cross-user', async () => {
      routineModel.findByPk.mockResolvedValueOnce({
        id: 'r-cross',
        userId: stranger,
      });
      await expect(service.startAsWorkoutLog(me, 'r-cross')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
