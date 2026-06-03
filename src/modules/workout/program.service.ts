import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { assertOwned } from '../../common/utils/ownership.utils';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../common/dto/pagination.dto';
import { Exercise } from '../exercise/entities/exercise.entity';
import {
  ExerciseSource,
  ExerciseVisibility,
} from '../exercise/entities/exercise.enums';
import { User } from '../user/entities/user.entity';
import { PrescribedExercise } from './entities/prescribed-exercise.entity';
import { PrescribedSet } from './entities/prescribed-set.entity';
import { Program } from './entities/program.entity';
import { ProgramWorkout } from './entities/program-workout.entity';
import { ProgramStatus } from './entities/workout.enums';
import { CreatePrescribedExerciseDto } from './dto/create-prescribed-exercise.dto';
import { CreatePrescribedSetDto } from './dto/create-prescribed-set.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateProgramWorkoutDto } from './dto/create-program-workout.dto';
import { ListProgramsQueryDto } from './dto/list-programs.query.dto';
import { UpdatePrescribedExerciseDto } from './dto/update-prescribed-exercise.dto';
import { UpdatePrescribedSetDto } from './dto/update-prescribed-set.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramWorkoutDto } from './dto/update-program-workout.dto';

/**
 * ProgramService — nested CRUD across the program-authoring tree
 * (program → program_workout → prescribed_exercise → prescribed_set).
 *
 * Ownership is enforced at the program root. All nested operations
 * load the program first (via `_loadProgram`) and then verify the
 * nested-id parent chain — a workout must belong to the program,
 * an exercise must belong to the workout, a set must belong to the
 * exercise. Service throws 404 with the same hide-existence pattern
 * the exercise module uses (locked decision §16-style for shared
 * resources, applied here for cross-instructor probes).
 *
 * Locked decisions touched:
 *   - §3 — programs are per-instructor private; no marketplace.
 *   - §15 — sets snapshot kg/m/s in storage; FE converts at the edge.
 */
@Injectable()
export class ProgramService {
  constructor(
    @InjectModel(Program) private readonly programModel: typeof Program,
    @InjectModel(ProgramWorkout)
    private readonly workoutModel: typeof ProgramWorkout,
    @InjectModel(PrescribedExercise)
    private readonly prescribedExerciseModel: typeof PrescribedExercise,
    @InjectModel(PrescribedSet)
    private readonly prescribedSetModel: typeof PrescribedSet,
    @InjectModel(Exercise) private readonly exerciseModel: typeof Exercise,
    private readonly sequelize: Sequelize,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Program — top-level CRUD
  // ────────────────────────────────────────────────────────────────────

  async list(filter: ListProgramsQueryDto, ownerId: string) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where = {
      ownerId,
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? { name: { [Op.iLike]: `%${filter.search.trim()}%` } }
        : {}),
    };

    const { rows, count } = await this.programModel.findAndCountAll({
      where,
      order: [['updatedAt', 'DESC']],
      offset: getOffset(page, limit),
      limit,
    });

    return buildPaginatedResponse(rows, count, page, limit);
  }

  /**
   * Detail view — full nested tree. Workouts ordered by
   * `sequenceNumber`, exercises by `orderIndex`, sets by `orderIndex`.
   */
  async findById(id: string, ownerId: string): Promise<Program> {
    const program = await this.programModel.findByPk(id, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl', 'handle'],
        },
        {
          model: ProgramWorkout,
          as: 'workouts',
          separate: true,
          order: [['sequenceNumber', 'ASC']],
          include: [
            {
              model: PrescribedExercise,
              as: 'exercises',
              separate: true,
              order: [['orderIndex', 'ASC']],
              include: [
                {
                  model: Exercise,
                  as: 'exercise',
                  attributes: [
                    'id',
                    'name',
                    'slug',
                    'kind',
                    'level',
                    'thumbnailUrl',
                  ],
                },
                {
                  model: PrescribedSet,
                  as: 'sets',
                  separate: true,
                  order: [['orderIndex', 'ASC']],
                },
              ],
            },
          ],
        },
      ],
    });

    assertOwned(program, ownerId, (p) => p.ownerId, {
      notFoundMessage: 'Program not found.',
      onMismatch: 'hide',
    });
    return program;
  }

  async create(dto: CreateProgramDto, ownerId: string): Promise<Program> {
    return this.programModel.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      kind: dto.kind ?? 'WORKOUT',
      status: dto.status ?? ProgramStatus.Draft,
      durationDays: dto.durationDays ?? null,
      periodizationModel: dto.periodizationModel?.trim() || null,
      coverImageUrl: dto.coverImageUrl ?? null,
      goalTags: dto.goalTags ?? null,
      ownerId,
    });
  }

  async update(
    id: string,
    dto: UpdateProgramDto,
    ownerId: string,
  ): Promise<Program> {
    const program = await this._loadProgram(id, ownerId);
    await program.update({
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description?.trim() || null,
      }),
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.durationDays !== undefined && {
        durationDays: dto.durationDays,
      }),
      ...(dto.periodizationModel !== undefined && {
        periodizationModel: dto.periodizationModel?.trim() || null,
      }),
      ...(dto.coverImageUrl !== undefined && {
        coverImageUrl: dto.coverImageUrl ?? null,
      }),
      ...(dto.goalTags !== undefined && { goalTags: dto.goalTags ?? null }),
    });
    return program;
  }

  async softDelete(id: string, ownerId: string): Promise<void> {
    const program = await this._loadProgram(id, ownerId);
    await program.destroy();
  }

  // ────────────────────────────────────────────────────────────────────
  // ProgramWorkout — nested under a program
  // ────────────────────────────────────────────────────────────────────

  async addWorkout(
    programId: string,
    dto: CreateProgramWorkoutDto,
    ownerId: string,
  ): Promise<ProgramWorkout> {
    await this._loadProgram(programId, ownerId);

    // Uniqueness on (programId, weekIndex, dayIndex) enforced by the
    // partial unique index — surface as 409 with a clear message
    // before the DB constraint fires.
    const existing = await this.workoutModel.findOne({
      where: {
        programId,
        weekIndex: dto.weekIndex,
        dayIndex: dto.dayIndex,
      },
      attributes: ['id'],
    });
    if (existing) {
      throw new ConflictException(
        `A workout already exists at week ${dto.weekIndex + 1}, day ${dto.dayIndex + 1}.`,
      );
    }

    // sequence_number = current max + 1 (or 0 for the first workout).
    const nextSeq = await this._nextSequenceNumber(programId);

    return this.workoutModel.create({
      programId,
      name: dto.name.trim(),
      notes: dto.notes?.trim() || null,
      weekIndex: dto.weekIndex,
      dayIndex: dto.dayIndex,
      sequenceNumber: nextSeq,
      phase: dto.phase?.trim() || null,
      estimatedDurationMinutes: dto.estimatedDurationMinutes ?? null,
    });
  }

  async updateWorkout(
    programId: string,
    workoutId: string,
    dto: UpdateProgramWorkoutDto,
    ownerId: string,
  ): Promise<ProgramWorkout> {
    const workout = await this._loadWorkout(programId, workoutId, ownerId);

    // If repositioning, re-check uniqueness against other workouts.
    if (
      (dto.weekIndex !== undefined && dto.weekIndex !== workout.weekIndex) ||
      (dto.dayIndex !== undefined && dto.dayIndex !== workout.dayIndex)
    ) {
      const targetWeek = dto.weekIndex ?? workout.weekIndex;
      const targetDay = dto.dayIndex ?? workout.dayIndex;
      const clash = await this.workoutModel.findOne({
        where: {
          programId,
          weekIndex: targetWeek,
          dayIndex: targetDay,
          id: { [Op.ne]: workoutId },
        },
        attributes: ['id'],
      });
      if (clash) {
        throw new ConflictException(
          `Another workout already occupies week ${targetWeek + 1}, day ${targetDay + 1}.`,
        );
      }
    }

    await workout.update({
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
      ...(dto.weekIndex !== undefined && { weekIndex: dto.weekIndex }),
      ...(dto.dayIndex !== undefined && { dayIndex: dto.dayIndex }),
      ...(dto.phase !== undefined && {
        phase: dto.phase?.trim() || null,
      }),
      ...(dto.estimatedDurationMinutes !== undefined && {
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
      }),
    });
    return workout;
  }

  async removeWorkout(
    programId: string,
    workoutId: string,
    ownerId: string,
  ): Promise<void> {
    const workout = await this._loadWorkout(programId, workoutId, ownerId);
    // CASCADE on FK takes care of nested exercises + sets. The program
    // workout table isn't paranoid (only program is) — hard delete OK
    // because no `assigned_workout` references it directly (those
    // reference via `master_workout_id` which is ON DELETE SET NULL).
    await workout.destroy();
  }

  // ────────────────────────────────────────────────────────────────────
  // PrescribedExercise — nested under a workout
  // ────────────────────────────────────────────────────────────────────

  async addExercise(
    programId: string,
    workoutId: string,
    dto: CreatePrescribedExerciseDto,
    ownerId: string,
  ): Promise<PrescribedExercise> {
    await this._loadWorkout(programId, workoutId, ownerId);
    await this._assertExerciseUsable(dto.exerciseId, ownerId);
    if (dto.alternateExerciseId) {
      await this._assertExerciseUsable(dto.alternateExerciseId, ownerId);
    }

    const orderIndex =
      dto.orderIndex ?? (await this._nextExerciseOrderIndex(workoutId));

    return this.prescribedExerciseModel.create({
      programWorkoutId: workoutId,
      exerciseId: dto.exerciseId,
      blockId: dto.blockId ?? null,
      supersetGroupId: dto.supersetGroupId ?? null,
      orderIndex,
      notes: dto.notes?.trim() || null,
      alternateExerciseId: dto.alternateExerciseId ?? null,
    });
  }

  async updateExercise(
    programId: string,
    workoutId: string,
    exerciseId: string,
    dto: UpdatePrescribedExerciseDto,
    ownerId: string,
  ): Promise<PrescribedExercise> {
    const row = await this._loadPrescribedExercise(
      programId,
      workoutId,
      exerciseId,
      ownerId,
    );

    if (dto.exerciseId && dto.exerciseId !== row.exerciseId) {
      await this._assertExerciseUsable(dto.exerciseId, ownerId);
    }
    if (
      dto.alternateExerciseId &&
      dto.alternateExerciseId !== row.alternateExerciseId
    ) {
      await this._assertExerciseUsable(dto.alternateExerciseId, ownerId);
    }

    await row.update({
      ...(dto.exerciseId !== undefined && { exerciseId: dto.exerciseId }),
      ...(dto.blockId !== undefined && { blockId: dto.blockId ?? null }),
      ...(dto.supersetGroupId !== undefined && {
        supersetGroupId: dto.supersetGroupId ?? null,
      }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
      ...(dto.alternateExerciseId !== undefined && {
        alternateExerciseId: dto.alternateExerciseId ?? null,
      }),
    });
    return row;
  }

  async removeExercise(
    programId: string,
    workoutId: string,
    exerciseId: string,
    ownerId: string,
  ): Promise<void> {
    const row = await this._loadPrescribedExercise(
      programId,
      workoutId,
      exerciseId,
      ownerId,
    );
    await row.destroy();
  }

  // ────────────────────────────────────────────────────────────────────
  // PrescribedSet — nested under a prescribed exercise
  // ────────────────────────────────────────────────────────────────────

  async addSet(
    programId: string,
    workoutId: string,
    exerciseId: string,
    dto: CreatePrescribedSetDto,
    ownerId: string,
  ): Promise<PrescribedSet> {
    await this._loadPrescribedExercise(
      programId,
      workoutId,
      exerciseId,
      ownerId,
    );
    this._assertSetCoherent(dto);

    const orderIndex =
      dto.orderIndex ?? (await this._nextSetOrderIndex(exerciseId));

    return this.prescribedSetModel.create({
      prescribedExerciseId: exerciseId,
      orderIndex,
      setType: dto.setType ?? 'NORMAL',
      targetRepsMin: dto.targetRepsMin ?? null,
      targetRepsMax: dto.targetRepsMax ?? null,
      targetWeightKg: dto.targetWeightKg ?? null,
      targetWeightPercent1rm: dto.targetWeightPercent1rm ?? null,
      targetDurationSeconds: dto.targetDurationSeconds ?? null,
      targetDistanceMeters: dto.targetDistanceMeters ?? null,
      targetRpe: dto.targetRpe ?? null,
      targetRir: dto.targetRir ?? null,
      restAfterSeconds: dto.restAfterSeconds ?? null,
      tempo: dto.tempo ?? null,
      notes: dto.notes?.trim() || null,
    });
  }

  async updateSet(
    programId: string,
    workoutId: string,
    exerciseId: string,
    setId: string,
    dto: UpdatePrescribedSetDto,
    ownerId: string,
  ): Promise<PrescribedSet> {
    const set = await this._loadPrescribedSet(
      programId,
      workoutId,
      exerciseId,
      setId,
      ownerId,
    );
    this._assertSetCoherent({ ...set.get({ plain: true }), ...dto });

    await set.update({
      ...(dto.setType !== undefined && { setType: dto.setType }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      ...(dto.targetRepsMin !== undefined && {
        targetRepsMin: dto.targetRepsMin ?? null,
      }),
      ...(dto.targetRepsMax !== undefined && {
        targetRepsMax: dto.targetRepsMax ?? null,
      }),
      ...(dto.targetWeightKg !== undefined && {
        targetWeightKg: dto.targetWeightKg ?? null,
      }),
      ...(dto.targetWeightPercent1rm !== undefined && {
        targetWeightPercent1rm: dto.targetWeightPercent1rm ?? null,
      }),
      ...(dto.targetDurationSeconds !== undefined && {
        targetDurationSeconds: dto.targetDurationSeconds ?? null,
      }),
      ...(dto.targetDistanceMeters !== undefined && {
        targetDistanceMeters: dto.targetDistanceMeters ?? null,
      }),
      ...(dto.targetRpe !== undefined && {
        targetRpe: dto.targetRpe ?? null,
      }),
      ...(dto.targetRir !== undefined && {
        targetRir: dto.targetRir ?? null,
      }),
      ...(dto.restAfterSeconds !== undefined && {
        restAfterSeconds: dto.restAfterSeconds ?? null,
      }),
      ...(dto.tempo !== undefined && { tempo: dto.tempo ?? null }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
    });
    return set;
  }

  async removeSet(
    programId: string,
    workoutId: string,
    exerciseId: string,
    setId: string,
    ownerId: string,
  ): Promise<void> {
    const set = await this._loadPrescribedSet(
      programId,
      workoutId,
      exerciseId,
      setId,
      ownerId,
    );
    await set.destroy();
  }

  // ────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────

  private async _loadProgram(id: string, ownerId: string): Promise<Program> {
    const program = await this.programModel.findByPk(id);
    assertOwned(program, ownerId, (p) => p.ownerId, {
      notFoundMessage: 'Program not found.',
      onMismatch: 'hide',
    });
    return program;
  }

  private async _loadWorkout(
    programId: string,
    workoutId: string,
    ownerId: string,
  ): Promise<ProgramWorkout> {
    await this._loadProgram(programId, ownerId);
    const workout = await this.workoutModel.findOne({
      where: { id: workoutId, programId },
    });
    if (!workout) {
      throw new NotFoundException('Workout not found.');
    }
    return workout;
  }

  private async _loadPrescribedExercise(
    programId: string,
    workoutId: string,
    exerciseRowId: string,
    ownerId: string,
  ): Promise<PrescribedExercise> {
    await this._loadWorkout(programId, workoutId, ownerId);
    const row = await this.prescribedExerciseModel.findOne({
      where: { id: exerciseRowId, programWorkoutId: workoutId },
    });
    if (!row) {
      throw new NotFoundException('Exercise slot not found.');
    }
    return row;
  }

  private async _loadPrescribedSet(
    programId: string,
    workoutId: string,
    exerciseRowId: string,
    setId: string,
    ownerId: string,
  ): Promise<PrescribedSet> {
    await this._loadPrescribedExercise(
      programId,
      workoutId,
      exerciseRowId,
      ownerId,
    );
    const set = await this.prescribedSetModel.findOne({
      where: { id: setId, prescribedExerciseId: exerciseRowId },
    });
    if (!set) {
      throw new NotFoundException('Set not found.');
    }
    return set;
  }

  /**
   * The exercise being added to a program must be readable by the
   * caller — SYSTEM, their own, or a PUBLIC custom by another
   * instructor. Mirror of `ExerciseService.canRead`. Hides existence
   * (404) for PRIVATE rows not owned by the caller.
   */
  private async _assertExerciseUsable(
    exerciseId: string,
    ownerId: string,
  ): Promise<void> {
    const exercise = await this.exerciseModel.findByPk(exerciseId, {
      attributes: ['id', 'source', 'visibility', 'ownerId'],
    });
    if (!exercise) {
      throw new NotFoundException('Exercise not found.');
    }
    const readable =
      exercise.source === ExerciseSource.System ||
      exercise.visibility === ExerciseVisibility.Public ||
      exercise.ownerId === ownerId;
    if (!readable) {
      throw new NotFoundException('Exercise not found.');
    }
  }

  /**
   * Cross-field set coherence — rep range bounds + weight modes.
   * The DB has CHECKs too but a clean 400 reads better than a
   * Postgres exception bubble.
   */
  private _assertSetCoherent(dto: {
    targetRepsMin?: number | null;
    targetRepsMax?: number | null;
    targetWeightKg?: number | null;
    targetWeightPercent1rm?: number | null;
  }): void {
    if (
      dto.targetRepsMin != null &&
      dto.targetRepsMax != null &&
      dto.targetRepsMin > dto.targetRepsMax
    ) {
      throw new BadRequestException(
        'targetRepsMin must not exceed targetRepsMax.',
      );
    }
    if (dto.targetWeightKg != null && dto.targetWeightPercent1rm != null) {
      // Soft warning — we accept both, but flag the mixed signal so
      // FE can show a yellow hint. For V1, reject outright; the FE
      // picker should be single-mode.
      throw new BadRequestException(
        'Pick either targetWeightKg or targetWeightPercent1rm, not both.',
      );
    }
  }

  // `model.max()` returns `unknown` in current Sequelize types. `null`
  // means no rows in scope yet → first row gets index 0. `Number()`
  // coerces the boxed pg return without a TS assertion.
  private async _nextSequenceNumber(programId: string): Promise<number> {
    const last = await this.workoutModel.max('sequenceNumber', {
      where: { programId },
    });
    return last == null ? 0 : Number(last) + 1;
  }

  private async _nextExerciseOrderIndex(workoutId: string): Promise<number> {
    const last = await this.prescribedExerciseModel.max('orderIndex', {
      where: { programWorkoutId: workoutId },
    });
    return last == null ? 0 : Number(last) + 1;
  }

  private async _nextSetOrderIndex(exerciseId: string): Promise<number> {
    const last = await this.prescribedSetModel.max('orderIndex', {
      where: { prescribedExerciseId: exerciseId },
    });
    return last == null ? 0 : Number(last) + 1;
  }
}
