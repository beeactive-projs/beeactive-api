import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import {
  buildPaginatedResponse,
  getOffset,
} from '../../common/dto/pagination.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Exercise } from '../exercise/entities/exercise.entity';
import { AssignedExercise } from './entities/assigned-exercise.entity';
import { AssignedSet } from './entities/assigned-set.entity';
import { AssignedWorkout } from './entities/assigned-workout.entity';
import { LoggedExercise } from './entities/logged-exercise.entity';
import { LoggedSet } from './entities/logged-set.entity';
import { OneRepMax } from './entities/one-rep-max.entity';
import { WorkoutLog } from './entities/workout-log.entity';
import { OneRepMaxSource, WorkoutLogStatus } from './entities/workout.enums';
import { CompleteWorkoutDto } from './dto/complete-workout.dto';
import { LogSetDto } from './dto/log-set.dto';
import { RecordOneRepMaxDto } from './dto/record-one-rep-max.dto';
import { StartWorkoutDto } from './dto/start-workout.dto';

/**
 * WorkoutLogService — the client-side surface. Three core flows:
 *
 *   1. **Start** — `start({assignedWorkoutId?})` creates a WorkoutLog
 *      and (when assigned) hydrates the entire log tree from the
 *      assignment, resolving every %1RM-targeted set against the
 *      latest one_rep_max for (client, exercise). Single transaction.
 *
 *   2. **Log a set** — `logSet(workoutLogId, setId, dto)` updates one
 *      logged_set row. Mark-complete-only is valid (locked §11).
 *
 *   3. **Complete** — `complete(workoutLogId, dto)` computes duration,
 *      flips status, mirrors to the assigned_workout, updates the
 *      assignment's completion_percent, and optionally auto-suggests
 *      a 1RM from a heavy logged set via Epley.
 */
@Injectable()
export class WorkoutLogService {
  constructor(
    @InjectModel(WorkoutLog) private readonly logModel: typeof WorkoutLog,
    @InjectModel(LoggedExercise)
    private readonly loggedExerciseModel: typeof LoggedExercise,
    @InjectModel(LoggedSet)
    private readonly loggedSetModel: typeof LoggedSet,
    @InjectModel(AssignedWorkout)
    private readonly assignedWorkoutModel: typeof AssignedWorkout,
    @InjectModel(AssignedExercise)
    private readonly assignedExerciseModel: typeof AssignedExercise,
    @InjectModel(AssignedSet)
    private readonly assignedSetModel: typeof AssignedSet,
    @InjectModel(OneRepMax) private readonly oneRepMaxModel: typeof OneRepMax,
    @InjectModel(Exercise) private readonly exerciseModel: typeof Exercise,
    private readonly sequelize: Sequelize,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Start
  // ────────────────────────────────────────────────────────────────────

  async start(userId: string, dto: StartWorkoutDto): Promise<WorkoutLog> {
    if (!dto.assignedWorkoutId && !dto.name?.trim()) {
      throw new BadRequestException(
        'Freestyle workouts require a name; assigned workouts require assignedWorkoutId.',
      );
    }

    if (!dto.assignedWorkoutId) {
      // Freestyle — minimal create, exercises added via separate flow (V2).
      return this.logModel.create({
        userId,
        programAssignmentId: null,
        assignedWorkoutId: null,
        name: dto.name!.trim(),
        status: WorkoutLogStatus.InProgress,
      });
    }

    const aw = await this.assignedWorkoutModel.findByPk(dto.assignedWorkoutId, {
      include: [
        {
          model: AssignedExercise,
          as: 'exercises',
          separate: true,
          order: [['orderIndex', 'ASC']],
          include: [
            {
              model: Exercise,
              as: 'exercise',
              attributes: ['id', 'name', 'thumbnailUrl'],
            },
            {
              model: AssignedSet,
              as: 'sets',
              separate: true,
              order: [['orderIndex', 'ASC']],
            },
          ],
        },
      ],
    });
    if (!aw) {
      throw new NotFoundException('Assigned workout not found.');
    }

    // Authorization: the assigned workout must belong to an assignment
    // whose client is the caller. We do the cheap check via raw join
    // to avoid pulling the whole assignment row.
    const ownsAssignment = await this.assignedWorkoutOwnedByClient(
      aw.id,
      userId,
    );
    if (!ownsAssignment) {
      throw new NotFoundException('Assigned workout not found.');
    }

    // Compute %1RM resolutions once, batched by exercise.
    const oneRmMap = await this.fetchLatestOneRepMaxesForExercises(
      userId,
      (aw.exercises ?? []).map((e) => e.exerciseId),
    );

    return this.sequelize.transaction(async (tx) => {
      const log = await this.logModel.create(
        {
          userId,
          programAssignmentId: aw.programAssignmentId,
          assignedWorkoutId: aw.id,
          name: aw.name,
          status: WorkoutLogStatus.InProgress,
        },
        { transaction: tx },
      );

      // Mirror status onto the assignment-side workout — drives the
      // "Today's workout" preview "in progress" state on the client.
      await aw.update(
        { status: WorkoutLogStatus.InProgress },
        { transaction: tx },
      );

      for (const ae of aw.exercises ?? []) {
        const le = await this.loggedExerciseModel.create(
          {
            workoutLogId: log.id,
            exerciseId: ae.exerciseId,
            assignedExerciseId: ae.id,
            exerciseNameSnapshot: ae.exercise?.name ?? 'Exercise',
            exerciseThumbnailUrlSnapshot: ae.exercise?.thumbnailUrl ?? null,
            orderIndex: ae.orderIndex,
            supersetGroupId: ae.supersetGroupId,
            notes: null,
          },
          { transaction: tx },
        );

        // Resolve every set with target_weight_percent_1rm against the
        // user's latest 1RM and stamp the resolved kg back onto the
        // assigned_set row. Same tx so a rollback unwinds the stamp.
        for (const aset of ae.sets ?? []) {
          if (
            aset.targetWeightPercent1rm != null &&
            aset.targetWeightKg == null
          ) {
            const oneRm = oneRmMap.get(ae.exerciseId);
            if (oneRm != null) {
              const resolved =
                Math.round(
                  ((aset.targetWeightPercent1rm * oneRm) / 100) * 100,
                ) / 100;
              await aset.update(
                { resolvedWeightKg: resolved, resolvedAt: new Date() },
                { transaction: tx },
              );
            }
          }
        }

        // Pre-seed logged_set rows mirroring the assigned plan so the
        // client just ticks them off (one row per planned set).
        const sets = ae.sets ?? [];
        if (sets.length) {
          await this.loggedSetModel.bulkCreate(
            sets.map((aset) => ({
              loggedExerciseId: le.id,
              assignedSetId: aset.id,
              orderIndex: aset.orderIndex,
              setType: aset.setType,
              isCompleted: false,
            })),
            { transaction: tx },
          );
        }
      }

      return log;
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Per-set log
  // ────────────────────────────────────────────────────────────────────

  async logSet(
    workoutLogId: string,
    setId: string,
    dto: LogSetDto,
    userId: string,
  ): Promise<LoggedSet> {
    const log = await this._loadOwnedLog(workoutLogId, userId);
    if (log.status !== WorkoutLogStatus.InProgress) {
      throw new BadRequestException(
        'Cannot log sets on a workout that is no longer in progress.',
      );
    }
    const set = await this.loggedSetModel.findByPk(setId, {
      include: [
        { model: LoggedExercise, as: 'exercise', attributes: ['workoutLogId'] },
      ],
    });
    if (!set || set.exercise?.workoutLogId !== workoutLogId) {
      throw new NotFoundException('Set not found.');
    }
    await set.update({
      ...(dto.setType !== undefined && { setType: dto.setType }),
      ...(dto.reps !== undefined && { reps: dto.reps ?? null }),
      ...(dto.weightKg !== undefined && { weightKg: dto.weightKg ?? null }),
      ...(dto.durationSeconds !== undefined && {
        durationSeconds: dto.durationSeconds ?? null,
      }),
      ...(dto.distanceMeters !== undefined && {
        distanceMeters: dto.distanceMeters ?? null,
      }),
      ...(dto.rpe !== undefined && { rpe: dto.rpe ?? null }),
      ...(dto.rir !== undefined && { rir: dto.rir ?? null }),
      ...(dto.restAfterSeconds !== undefined && {
        restAfterSeconds: dto.restAfterSeconds ?? null,
      }),
      ...(dto.isCompleted !== undefined && {
        isCompleted: dto.isCompleted,
        completedAt: dto.isCompleted ? new Date() : null,
      }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
    });
    return set;
  }

  // ────────────────────────────────────────────────────────────────────
  // Complete
  // ────────────────────────────────────────────────────────────────────

  async complete(
    workoutLogId: string,
    dto: CompleteWorkoutDto,
    userId: string,
  ): Promise<WorkoutLog> {
    const log = await this._loadOwnedLog(workoutLogId, userId);
    if (log.status === WorkoutLogStatus.Completed) return log; // idempotent

    const completedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000),
    );

    await this.sequelize.transaction(async (tx) => {
      await log.update(
        {
          status: WorkoutLogStatus.Completed,
          completedAt,
          durationSeconds,
          ...(dto.feelingRating !== undefined && {
            feelingRating: dto.feelingRating,
          }),
          ...(dto.notes !== undefined && {
            notes: dto.notes?.trim() || null,
          }),
        },
        { transaction: tx },
      );

      // Mirror status to the assigned_workout and bump the
      // assignment-wide completion_percent.
      if (log.assignedWorkoutId) {
        await this.assignedWorkoutModel.update(
          { status: WorkoutLogStatus.Completed },
          { where: { id: log.assignedWorkoutId }, transaction: tx },
        );
      }
      if (log.programAssignmentId) {
        await this.recomputeAssignmentProgress(log.programAssignmentId, tx);
      }
    });

    return log;
  }

  // ────────────────────────────────────────────────────────────────────
  // One-rep-max
  // ────────────────────────────────────────────────────────────────────

  async recordOneRepMax(
    userId: string,
    dto: RecordOneRepMaxDto,
  ): Promise<OneRepMax> {
    return this.oneRepMaxModel.create({
      userId,
      exerciseId: dto.exerciseId,
      weightKg: dto.weightKg,
      source: dto.source ?? OneRepMaxSource.Manual,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      notes: dto.notes?.trim() || null,
    });
  }

  async listOneRepMaxes(userId: string, query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { rows, count } = await this.oneRepMaxModel.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Exercise,
          as: 'exercise',
          attributes: ['id', 'name', 'slug', 'kind'],
        },
      ],
      order: [['recordedAt', 'DESC']],
      offset: getOffset(page, limit),
      limit,
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  /**
   * Compute an Epley-estimated 1RM from a single heavy set. Returns
   * null when not enough info (no reps, or no weight, or > 12 reps —
   * Epley breaks down beyond ~10 reps).
   *
   *   1RM ≈ weight × (1 + reps / 30)
   */
  estimateOneRepMaxEpley(
    reps: number | null,
    weightKg: number | null,
  ): number | null {
    if (reps == null || weightKg == null) return null;
    if (reps < 1 || reps > 12 || weightKg <= 0) return null;
    return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
  }

  // ────────────────────────────────────────────────────────────────────
  // List + detail
  // ────────────────────────────────────────────────────────────────────

  async listForUser(userId: string, query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { rows, count } = await this.logModel.findAndCountAll({
      where: { userId },
      order: [['startedAt', 'DESC']],
      offset: getOffset(page, limit),
      limit,
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async findById(id: string, userId: string): Promise<WorkoutLog> {
    const log = await this.logModel.findByPk(id, {
      include: [
        {
          model: LoggedExercise,
          as: 'exercises',
          separate: true,
          order: [['orderIndex', 'ASC']],
          include: [
            {
              model: LoggedSet,
              as: 'sets',
              separate: true,
              order: [['orderIndex', 'ASC']],
            },
          ],
        },
      ],
    });
    if (!log || log.userId !== userId) {
      throw new NotFoundException('Workout log not found.');
    }
    return log;
  }

  // ────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────

  private async _loadOwnedLog(id: string, userId: string): Promise<WorkoutLog> {
    const log = await this.logModel.findByPk(id);
    if (!log || log.userId !== userId) {
      throw new NotFoundException('Workout log not found.');
    }
    return log;
  }

  private async assignedWorkoutOwnedByClient(
    assignedWorkoutId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.assignedWorkoutModel.findOne({
      where: { id: assignedWorkoutId },
      include: [
        {
          association: 'assignment',
          attributes: ['id', 'clientId'],
          required: true,
        },
      ],
    });
    return !!row && row.assignment?.clientId === userId;
  }

  /**
   * Single query for all (user, exerciseId) 1RM lookups needed by a
   * workout-start. Returns the latest `weightKg` per exercise — empty
   * map entries simply mean "no 1RM recorded".
   */
  private async fetchLatestOneRepMaxesForExercises(
    userId: string,
    exerciseIds: string[],
  ): Promise<Map<string, number>> {
    if (exerciseIds.length === 0) return new Map();
    const rows = await this.oneRepMaxModel.findAll({
      where: { userId, exerciseId: { [Op.in]: exerciseIds } },
      order: [['recordedAt', 'DESC']],
      attributes: ['exerciseId', 'weightKg', 'recordedAt'],
    });
    const map = new Map<string, number>();
    // Rows come newest-first; first match per exerciseId wins.
    for (const r of rows) {
      if (!map.has(r.exerciseId)) {
        map.set(r.exerciseId, Number(r.weightKg));
      }
    }
    return map;
  }

  private async recomputeAssignmentProgress(
    assignmentId: string,
    tx: Transaction,
  ): Promise<void> {
    const [total, done] = await Promise.all([
      this.assignedWorkoutModel.count({
        where: { programAssignmentId: assignmentId },
        transaction: tx,
      }),
      this.assignedWorkoutModel.count({
        where: {
          programAssignmentId: assignmentId,
          status: WorkoutLogStatus.Completed,
        },
        transaction: tx,
      }),
    ]);
    if (total === 0) return;
    const percent = Math.min(100, Math.round((done / total) * 100));
    await this.sequelize.query(
      'UPDATE program_assignment SET completion_percent = :p, updated_at = NOW() WHERE id = :id',
      {
        replacements: { p: percent, id: assignmentId },
        transaction: tx,
      },
    );
  }
}
