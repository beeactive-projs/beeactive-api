import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { Exercise } from '../exercise/entities/exercise.entity';
import {
  ExerciseSource,
  ExerciseVisibility,
} from '../exercise/entities/exercise.enums';
import { PrescribedExercise } from './entities/prescribed-exercise.entity';
import { PrescribedSet } from './entities/prescribed-set.entity';
import { Program } from './entities/program.entity';
import { ProgramWorkout } from './entities/program-workout.entity';
import { ProgramService } from './program.service';
import {
  makeSequelizeMock,
  makeSilentLogger,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke tests for ProgramService — not exhaustive.
 *
 * Covers the load-bearing paths: ownership hide-existence, nested-id
 * parent assertion (workout must belong to program, set must belong
 * to exercise), uniqueness on (week, day), sequence-number /
 * order-index auto-allocation, and cross-field set coherence.
 */
describe('ProgramService (smoke — not exhaustive)', () => {
  let service: ProgramService;

  const programModel = {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
  const workoutModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    max: jest.fn(),
  };
  const prescribedExerciseModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    max: jest.fn(),
  };
  const prescribedSetModel = {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    max: jest.fn(),
  };
  const exerciseModel = { findByPk: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProgramService,
        { provide: getModelToken(Program), useValue: programModel },
        { provide: getModelToken(ProgramWorkout), useValue: workoutModel },
        {
          provide: getModelToken(PrescribedExercise),
          useValue: prescribedExerciseModel,
        },
        { provide: getModelToken(PrescribedSet), useValue: prescribedSetModel },
        { provide: getModelToken(Exercise), useValue: exerciseModel },
        { provide: Sequelize, useValue: makeSequelizeMock() },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = module.get(ProgramService);
  });

  // ─── Ownership hide-existence ────────────────────────────────────

  describe('program ownership', () => {
    it('hides existence when the program belongs to another instructor', async () => {
      programModel.findByPk.mockResolvedValueOnce({
        id: 'p-1',
        ownerId: 'other-owner',
      });
      await expect(service.findById('p-1', 'me')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns 404 when the program does not exist', async () => {
      programModel.findByPk.mockResolvedValueOnce(null);
      await expect(
        service.update('missing', { name: 'X' }, 'me'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Nested parent assertion ─────────────────────────────────────

  describe('nested parent assertion', () => {
    it('throws when a workout is not in the requested program', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce(null); // not in this program

      await expect(
        service.updateWorkout('p-1', 'w-other', { name: 'X' }, 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when an exercise slot is not in the requested workout', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce({
        id: 'w-1',
        programId: 'p-1',
      });
      prescribedExerciseModel.findOne.mockResolvedValueOnce(null);

      await expect(
        service.removeExercise('p-1', 'w-1', 'e-other', 'me'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when a set is not in the requested exercise slot', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce({
        id: 'w-1',
        programId: 'p-1',
      });
      prescribedExerciseModel.findOne.mockResolvedValueOnce({
        id: 'e-1',
        programWorkoutId: 'w-1',
      });
      prescribedSetModel.findOne.mockResolvedValueOnce(null);

      await expect(
        service.removeSet('p-1', 'w-1', 'e-1', 's-other', 'me'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Workout uniqueness ──────────────────────────────────────────

  describe('addWorkout', () => {
    it('rejects when (weekIndex, dayIndex) is already occupied', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce({ id: 'w-existing' });

      await expect(
        service.addWorkout(
          'p-1',
          { name: 'Day 1', weekIndex: 0, dayIndex: 0 },
          'me',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('computes sequenceNumber = (max + 1) on append', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce(null); // no clash
      workoutModel.max.mockResolvedValueOnce(4); // 5 existing workouts (0..4)
      workoutModel.create.mockResolvedValueOnce({ id: 'w-new' });

      await service.addWorkout(
        'p-1',
        { name: 'Day 6', weekIndex: 1, dayIndex: 1 },
        'me',
      );

      expect(workoutModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNumber: 5 }),
      );
    });

    it('uses sequenceNumber=0 for the very first workout', async () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce(null);
      workoutModel.max.mockResolvedValueOnce(null);
      workoutModel.create.mockResolvedValueOnce({ id: 'w-new' });

      await service.addWorkout(
        'p-1',
        { name: 'Day 1', weekIndex: 0, dayIndex: 0 },
        'me',
      );

      expect(workoutModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNumber: 0 }),
      );
    });
  });

  // ─── Exercise usability gate ─────────────────────────────────────

  describe('addExercise — exercise usability', () => {
    const setupChain = () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce({
        id: 'w-1',
        programId: 'p-1',
      });
    };

    it('accepts a SYSTEM exercise', async () => {
      setupChain();
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'ex-sys',
        source: ExerciseSource.System,
        visibility: ExerciseVisibility.Public,
        ownerId: null,
      });
      prescribedExerciseModel.max.mockResolvedValueOnce(null);
      prescribedExerciseModel.create.mockResolvedValueOnce({ id: 'pe-1' });

      await expect(
        service.addExercise('p-1', 'w-1', { exerciseId: 'ex-sys' }, 'me'),
      ).resolves.toBeTruthy();
    });

    it('hides existence of PRIVATE exercises owned by another instructor', async () => {
      setupChain();
      exerciseModel.findByPk.mockResolvedValueOnce({
        id: 'ex-priv',
        source: ExerciseSource.Instructor,
        visibility: ExerciseVisibility.Private,
        ownerId: 'other-owner',
      });

      await expect(
        service.addExercise('p-1', 'w-1', { exerciseId: 'ex-priv' }, 'me'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Set coherence ───────────────────────────────────────────────

  describe('addSet — cross-field validation', () => {
    const setupChain = () => {
      programModel.findByPk.mockResolvedValueOnce({ id: 'p-1', ownerId: 'me' });
      workoutModel.findOne.mockResolvedValueOnce({
        id: 'w-1',
        programId: 'p-1',
      });
      prescribedExerciseModel.findOne.mockResolvedValueOnce({
        id: 'e-1',
        programWorkoutId: 'w-1',
      });
    };

    it('rejects targetRepsMin > targetRepsMax', async () => {
      setupChain();
      await expect(
        service.addSet(
          'p-1',
          'w-1',
          'e-1',
          { targetRepsMin: 8, targetRepsMax: 5 },
          'me',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects passing BOTH targetWeightKg AND targetWeightPercent1rm', async () => {
      setupChain();
      await expect(
        service.addSet(
          'p-1',
          'w-1',
          'e-1',
          { targetWeightKg: 80, targetWeightPercent1rm: 75 },
          'me',
        ),
      ).rejects.toThrow(/Pick either/);
    });

    it('appends with orderIndex = max + 1', async () => {
      setupChain();
      prescribedSetModel.max.mockResolvedValueOnce(2);
      prescribedSetModel.create.mockResolvedValueOnce({ id: 's-3' });

      await service.addSet(
        'p-1',
        'w-1',
        'e-1',
        { targetRepsMin: 5, targetRepsMax: 5, targetWeightKg: 80 },
        'me',
      );

      expect(prescribedSetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderIndex: 3 }),
      );
    });
  });
});
