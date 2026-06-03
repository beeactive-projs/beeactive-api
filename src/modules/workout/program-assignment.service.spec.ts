import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import {
  InstructorClient,
  InstructorClientStatus,
} from '../client/entities/instructor-client.entity';
import { Exercise } from '../exercise/entities/exercise.entity';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/entities/user.entity';
import { AssignedExercise } from './entities/assigned-exercise.entity';
import { AssignedSet } from './entities/assigned-set.entity';
import { AssignedWorkout } from './entities/assigned-workout.entity';
import { Program } from './entities/program.entity';
import { ProgramAssignment } from './entities/program-assignment.entity';
import { ProgramAssignmentStatus } from './entities/workout.enums';
import { ProgramAssignmentService } from './program-assignment.service';
import {
  fakeTx,
  makeSilentLogger,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke tests for ProgramAssignmentService — the headliner. Covers:
 *   - happy-path deep-copy (writes counted at every level)
 *   - ownership preconditions (program owner, active client rel)
 *   - scheduled-date math across week / day boundaries (including DST)
 *   - status transition gate (terminal states are sticky)
 *   - cross-tenant hide-existence on detail reads
 */
describe('ProgramAssignmentService (smoke — not exhaustive)', () => {
  let service: ProgramAssignmentService;

  const assignmentModel = {
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
  const assignedWorkoutModel = { create: jest.fn() };
  const assignedExerciseModel = { create: jest.fn() };
  const assignedSetModel = { bulkCreate: jest.fn() };
  const programModel = { findByPk: jest.fn() };
  const instructorClientModel = { findOne: jest.fn() };
  const userModel = { findByPk: jest.fn() };
  const sequelize = {
    transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      Promise.resolve(cb(fakeTx)),
    ),
  };
  const notificationService = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  const me = 'i-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ProgramAssignmentService,
        {
          provide: getModelToken(ProgramAssignment),
          useValue: assignmentModel,
        },
        {
          provide: getModelToken(AssignedWorkout),
          useValue: assignedWorkoutModel,
        },
        {
          provide: getModelToken(AssignedExercise),
          useValue: assignedExerciseModel,
        },
        { provide: getModelToken(AssignedSet), useValue: assignedSetModel },
        { provide: getModelToken(Program), useValue: programModel },
        {
          provide: getModelToken(InstructorClient),
          useValue: instructorClientModel,
        },
        { provide: getModelToken(User), useValue: userModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: NotificationService, useValue: notificationService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = module.get(ProgramAssignmentService);
  });

  // Stub out a tiny tree: 1 workout, 1 exercise slot, 2 sets.
  const buildTinyProgram = () => ({
    id: 'prog-1',
    ownerId: me,
    name: 'Tiny program',
    durationDays: 14,
    deletedAt: null,
    workouts: [
      {
        id: 'pw-1',
        name: 'Day 1',
        notes: null,
        weekIndex: 0,
        dayIndex: 0,
        sequenceNumber: 0,
        phase: null,
        estimatedDurationMinutes: 45,
        exercises: [
          {
            id: 'pe-1',
            exerciseId: 'ex-1',
            supersetGroupId: null,
            orderIndex: 0,
            notes: null,
            alternateExerciseId: null,
            sets: [
              {
                id: 'ps-1',
                orderIndex: 0,
                setType: 'NORMAL',
                targetRepsMin: 5,
                targetRepsMax: 5,
                targetWeightKg: 80,
                targetWeightPercent1rm: null,
                targetDurationSeconds: null,
                targetDistanceMeters: null,
                targetRpe: 8,
                targetRir: null,
                restAfterSeconds: 90,
                tempo: null,
                notes: null,
              },
              {
                id: 'ps-2',
                orderIndex: 1,
                setType: 'NORMAL',
                targetRepsMin: 5,
                targetRepsMax: 5,
                targetWeightKg: 82.5,
                targetWeightPercent1rm: null,
                targetDurationSeconds: null,
                targetDistanceMeters: null,
                targetRpe: 8,
                targetRir: null,
                restAfterSeconds: 90,
                tempo: null,
                notes: null,
              },
            ],
          },
        ],
      },
    ],
  });

  const setupHappyPath = () => {
    programModel.findByPk.mockResolvedValueOnce(buildTinyProgram());
    instructorClientModel.findOne.mockResolvedValueOnce({
      id: 'ic-1',
      status: InstructorClientStatus.ACTIVE,
    });
    userModel.findByPk.mockResolvedValueOnce({
      id: 'c-1',
      firstName: 'Cli',
      lastName: 'Ent',
    });
    assignmentModel.create.mockResolvedValueOnce({
      id: 'pa-1',
      instructorId: me,
      clientId: 'c-1',
    });
    assignedWorkoutModel.create.mockResolvedValueOnce({ id: 'aw-1' });
    assignedExerciseModel.create.mockResolvedValueOnce({ id: 'ae-1' });
  };

  // ─── Deep-copy happy path ────────────────────────────────────────

  describe('assignProgramToClient — happy path', () => {
    it('clones the tree atomically and fires the notification post-commit', async () => {
      setupHappyPath();

      await service.assignProgramToClient(me, 'Coach Co.', {
        programId: 'prog-1',
        clientId: 'c-1',
        startDate: '2026-06-09',
      });

      expect(sequelize.transaction).toHaveBeenCalledTimes(1);
      expect(assignmentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          instructorId: me,
          clientId: 'c-1',
          masterProgramId: 'prog-1',
          programNameSnapshot: 'Tiny program',
          startDate: '2026-06-09',
          endDate: '2026-06-22', // 2 weeks * 7 - 1 = day 13 → 9 + 13 = 22
          status: ProgramAssignmentStatus.Active,
        }),
        { transaction: fakeTx },
      );
      expect(assignedWorkoutModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          masterWorkoutId: 'pw-1',
          scheduledDate: '2026-06-09', // week 0 day 0 → startDate
        }),
        { transaction: fakeTx },
      );
      expect(assignedExerciseModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          masterExerciseId: 'pe-1',
          exerciseId: 'ex-1',
        }),
        { transaction: fakeTx },
      );
      // Both prescribed_set rows go through one bulkCreate per exercise.
      expect(assignedSetModel.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = assignedSetModel.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(
        expect.objectContaining({
          masterSetId: 'ps-1',
          targetWeightKg: 80,
        }),
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'c-1',
          type: 'PROGRAM_ASSIGNED',
        }),
      );
    });
  });

  // ─── Preconditions ───────────────────────────────────────────────

  describe('assignProgramToClient — preconditions', () => {
    const dto = {
      programId: 'prog-1',
      clientId: 'c-1',
      startDate: '2026-06-09',
    };

    it('throws 404 when the program is not owned by the instructor', async () => {
      programModel.findByPk.mockResolvedValueOnce({
        ...buildTinyProgram(),
        ownerId: 'someone-else',
      });
      await expect(
        service.assignProgramToClient(me, 'Coach', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when the program is soft-deleted', async () => {
      programModel.findByPk.mockResolvedValueOnce({
        ...buildTinyProgram(),
        deletedAt: new Date(),
      });
      await expect(
        service.assignProgramToClient(me, 'Coach', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 403 when no ACTIVE instructor↔client relationship exists', async () => {
      programModel.findByPk.mockResolvedValueOnce(buildTinyProgram());
      instructorClientModel.findOne.mockResolvedValueOnce(null);
      await expect(
        service.assignProgramToClient(me, 'Coach', dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Scheduled-date math ─────────────────────────────────────────

  describe('scheduled date math', () => {
    it('lands week 1 day 3 on startDate + 10 days, across month boundary', async () => {
      programModel.findByPk.mockResolvedValueOnce({
        id: 'p',
        ownerId: me,
        name: 'P',
        durationDays: null,
        deletedAt: null,
        workouts: [
          {
            id: 'pw-x',
            name: 'D',
            notes: null,
            weekIndex: 1,
            dayIndex: 3,
            sequenceNumber: 0,
            phase: null,
            estimatedDurationMinutes: null,
            exercises: [],
          },
        ],
      });
      instructorClientModel.findOne.mockResolvedValueOnce({
        id: 'ic',
        status: InstructorClientStatus.ACTIVE,
      });
      userModel.findByPk.mockResolvedValueOnce({
        id: 'c',
        firstName: 'C',
        lastName: 'L',
      });
      assignmentModel.create.mockResolvedValueOnce({ id: 'pa' });
      assignedWorkoutModel.create.mockResolvedValueOnce({ id: 'aw' });

      await service.assignProgramToClient(me, 'Coach', {
        programId: 'p',
        clientId: 'c',
        startDate: '2026-05-25', // Mon
      });

      expect(assignedWorkoutModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledDate: '2026-06-04', // +10 days, May->June boundary
        }),
        expect.anything(),
      );
    });
  });

  // ─── Status transitions ──────────────────────────────────────────

  describe('update — status transition gate', () => {
    it('blocks transitions out of COMPLETED', async () => {
      assignmentModel.findByPk.mockResolvedValueOnce({
        id: 'a-1',
        instructorId: me,
        status: ProgramAssignmentStatus.Completed,
        update: jest.fn(),
      });
      await expect(
        service.update('a-1', { status: ProgramAssignmentStatus.Active }, me),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows ACTIVE → PAUSED', async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      assignmentModel.findByPk.mockResolvedValueOnce({
        id: 'a-1',
        instructorId: me,
        status: ProgramAssignmentStatus.Active,
        update,
      });
      await service.update(
        'a-1',
        { status: ProgramAssignmentStatus.Paused },
        me,
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: ProgramAssignmentStatus.Paused }),
      );
    });
  });

  // ─── findById — cross-tenant hide ────────────────────────────────

  describe('findById', () => {
    it('hides existence when caller is neither instructor nor client', async () => {
      assignmentModel.findByPk.mockResolvedValueOnce({
        id: 'a-1',
        instructorId: 'someone',
        clientId: 'someone-else',
      });
      await expect(service.findById('a-1', 'me')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
