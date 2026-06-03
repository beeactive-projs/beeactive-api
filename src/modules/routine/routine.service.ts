import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Sequelize } from 'sequelize-typescript';

import {
  buildPaginatedResponse,
  getOffset,
} from '../../common/dto/pagination.dto';
import { Exercise } from '../exercise/entities/exercise.entity';
import { LoggedExercise } from '../workout/entities/logged-exercise.entity';
import { LoggedSet } from '../workout/entities/logged-set.entity';
import { WorkoutLog } from '../workout/entities/workout-log.entity';
import { WorkoutLogStatus } from '../workout/entities/workout.enums';
import { CreateRoutineDto } from './dto/create-routine.dto';
import type { CreateRoutineExerciseDto } from './dto/create-routine.dto';
import { ListRoutinesQueryDto } from './dto/list-routines.query.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { Routine } from './entities/routine.entity';
import { RoutineExercise } from './entities/routine-exercise.entity';

/**
 * Routines — user-authored "saved workout shapes" the FE can start in one
 * tap. CRUD plus `startAsWorkoutLog`, which materialises a fresh WorkoutLog
 * (no assignedWorkoutId) and seeds its tree from the routine_exercise rows.
 *
 * Ownership: all reads + mutations 404 when the routine doesn't belong to
 * the caller (hides existence — matches the assignment + exercise patterns).
 */
@Injectable()
export class RoutineService {
  constructor(
    @InjectModel(Routine) private readonly routineModel: typeof Routine,
    @InjectModel(RoutineExercise)
    private readonly routineExerciseModel: typeof RoutineExercise,
    @InjectModel(Exercise) private readonly exerciseModel: typeof Exercise,
    @InjectModel(WorkoutLog) private readonly logModel: typeof WorkoutLog,
    @InjectModel(LoggedExercise)
    private readonly loggedExerciseModel: typeof LoggedExercise,
    @InjectModel(LoggedSet)
    private readonly loggedSetModel: typeof LoggedSet,
    private readonly sequelize: Sequelize,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateRoutineDto): Promise<Routine> {
    return this.sequelize.transaction(async (tx) => {
      const routine = await this.routineModel.create(
        {
          userId,
          name: dto.name.trim(),
          notes: dto.notes?.trim() || null,
          folder: dto.folder?.trim() || null,
        },
        { transaction: tx },
      );
      if (dto.exercises && dto.exercises.length > 0) {
        await this._seedExercises(routine.id, dto.exercises, tx);
      }
      return this._loadFull(routine.id, userId, tx);
    });
  }

  async list(userId: string, query: ListRoutinesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { rows, count } = await this.routineModel.findAndCountAll({
      where: { userId },
      // Sort by most-recently performed; never-performed routines bubble up
      // ordered by created_at so a brand-new routine isn't lost at the bottom.
      order: [
        ['lastPerformedAt', 'DESC NULLS FIRST'],
        ['createdAt', 'DESC'],
      ],
      offset: getOffset(page, limit),
      limit,
      include: [
        {
          model: RoutineExercise,
          as: 'exercises',
          separate: true,
          order: [['orderIndex', 'ASC']],
          attributes: ['id'],
        },
      ],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async findById(userId: string, id: string): Promise<Routine> {
    return this._loadFull(id, userId);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRoutineDto,
  ): Promise<Routine> {
    const existing = await this._loadOwned(id, userId);
    return this.sequelize.transaction(async (tx) => {
      await existing.update(
        {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.notes !== undefined && {
            notes: dto.notes?.trim() || null,
          }),
          ...(dto.folder !== undefined && {
            folder: dto.folder?.trim() || null,
          }),
        },
        { transaction: tx },
      );
      // exercises: replace wholesale when provided (the FE PATCHes the full
      // shape on save — diffing client-side is needless complexity for V1).
      if (dto.exercises !== undefined) {
        await this.routineExerciseModel.destroy({
          where: { routineId: existing.id },
          transaction: tx,
        });
        if (dto.exercises.length > 0) {
          await this._seedExercises(existing.id, dto.exercises, tx);
        }
      }
      return this._loadFull(existing.id, userId, tx);
    });
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const existing = await this._loadOwned(id, userId);
    await existing.destroy();
  }

  // ── Start as workout log (the headliner) ─────────────────────────

  /**
   * Materialise a fresh WorkoutLog from this routine and seed its tree.
   * Mirrors `WorkoutLogService.start({assignedWorkoutId})` — same shape,
   * different source. Atomic; rollback unwinds the seed.
   *
   * Returns the just-created WorkoutLog. The FE then navigates to
   * `/my/workout-log/:id` to land on the active log screen.
   */
  async startAsWorkoutLog(
    userId: string,
    routineId: string,
  ): Promise<WorkoutLog> {
    const routine = await this._loadOwned(routineId, userId);
    const rxs = await this.routineExerciseModel.findAll({
      where: { routineId: routine.id },
      order: [['orderIndex', 'ASC']],
      include: [
        {
          model: Exercise,
          as: 'exercise',
          attributes: ['id', 'name', 'thumbnailUrl'],
        },
      ],
    });

    const created = await this.sequelize.transaction(async (tx) => {
      const log = await this.logModel.create(
        {
          userId,
          programAssignmentId: null,
          assignedWorkoutId: null,
          name: routine.name,
          status: WorkoutLogStatus.InProgress,
        },
        { transaction: tx },
      );

      for (const rx of rxs) {
        const le = await this.loggedExerciseModel.create(
          {
            workoutLogId: log.id,
            exerciseId: rx.exerciseId,
            assignedExerciseId: null,
            exerciseNameSnapshot: rx.exercise?.name ?? 'Exercise',
            exerciseThumbnailUrlSnapshot: rx.exercise?.thumbnailUrl ?? null,
            orderIndex: rx.orderIndex,
            supersetGroupId: rx.supersetGroupId,
            notes: rx.notes,
          },
          { transaction: tx },
        );
        // Pre-seed N empty set rows mirroring the routine defaults. We don't
        // snapshot the target_* fields onto logged_set — the routine is
        // mutable, and the FE shows defaults as placeholders, not commitments.
        const sets = Math.max(1, rx.defaultSets ?? 3);
        await this.loggedSetModel.bulkCreate(
          Array.from({ length: sets }, (_, i) => ({
            loggedExerciseId: le.id,
            assignedSetId: null,
            orderIndex: i,
            setType: 'NORMAL',
            isCompleted: false,
          })),
          { transaction: tx },
        );
      }

      return log;
    });

    // Best-effort update of last_performed_at — failure here doesn't roll
    // the workout creation back (the log itself is the source of truth).
    try {
      await routine.update({ lastPerformedAt: new Date() });
    } catch (err) {
      this.logger.warn(
        `Failed to bump lastPerformedAt for routine ${routine.id}: ${(err as Error).message}`,
        'RoutineService',
      );
    }

    return created;
  }

  // ── Internals ────────────────────────────────────────────────────

  private async _loadOwned(id: string, userId: string): Promise<Routine> {
    const r = await this.routineModel.findByPk(id);
    if (!r || r.userId !== userId) {
      throw new NotFoundException('Routine not found.');
    }
    return r;
  }

  private async _loadFull(
    id: string,
    userId: string,
    tx?: import('sequelize').Transaction,
  ): Promise<Routine> {
    const r = await this.routineModel.findByPk(id, {
      include: [
        {
          model: RoutineExercise,
          as: 'exercises',
          separate: true,
          order: [['orderIndex', 'ASC']],
          include: [
            {
              model: Exercise,
              as: 'exercise',
              attributes: ['id', 'name', 'slug', 'kind', 'thumbnailUrl'],
            },
          ],
        },
      ],
      transaction: tx,
    });
    if (!r || r.userId !== userId) {
      throw new NotFoundException('Routine not found.');
    }
    return r;
  }

  private async _seedExercises(
    routineId: string,
    exercises: CreateRoutineExerciseDto[],
    tx: import('sequelize').Transaction,
  ): Promise<void> {
    // Validate every exerciseId resolves to a readable catalog row.
    // We don't enforce visibility here (the same as program builder) —
    // SYSTEM + PUBLIC are always readable; PRIVATE is owner-only and the
    // FE picker only surfaces those for the owner, so an attacker would
    // have to craft a request to add a stranger's PRIVATE exercise. We
    // gate on existence; the worst case is a row pointing at an exercise
    // the user can't see, which the FE handles via the snapshot fields.
    const ids = exercises.map((e) => e.exerciseId);
    const found = await this.exerciseModel.count({
      where: { id: ids },
      transaction: tx,
    });
    if (found !== new Set(ids).size) {
      throw new NotFoundException('One or more exercises not found.');
    }
    await this.routineExerciseModel.bulkCreate(
      exercises.map((ex, i) => ({
        routineId,
        exerciseId: ex.exerciseId,
        orderIndex: i,
        supersetGroupId: ex.supersetGroupId ?? null,
        notes: ex.notes?.trim() || null,
        defaultSets: ex.defaultSets ?? 3,
        targetRepsMin: ex.targetRepsMin ?? null,
        targetRepsMax: ex.targetRepsMax ?? null,
        targetWeightKg: ex.targetWeightKg ?? null,
        restAfterSeconds: ex.restAfterSeconds ?? null,
      })),
      { transaction: tx },
    );
  }
}
