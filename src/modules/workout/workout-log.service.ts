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
import { ProgramAssignment } from './entities/program-assignment.entity';
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
  // Add / remove exercise mid-session (freestyle + S14 affordances)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Append a catalog exercise to a logged session. Used by:
   *   - freestyle workouts (no assignment) building one exercise at a time
   *   - assigned workouts where the client adds an extra exercise
   *
   * The exercise must be readable (SYSTEM, owned, or PUBLIC custom);
   * the `prescribed`-style ownership check lives on the catalog model.
   * Snapshots name + thumbnail at write time so historical logs survive
   * catalog renames/deletes (matches the `start` flow).
   */
  async addExerciseToLog(
    workoutLogId: string,
    exerciseId: string,
    userId: string,
  ): Promise<LoggedExercise> {
    const log = await this._loadOwnedLog(workoutLogId, userId);
    if (log.status !== WorkoutLogStatus.InProgress) {
      throw new BadRequestException(
        'Cannot add exercises to a workout that is no longer in progress.',
      );
    }
    const exercise = await this.exerciseModel.findByPk(exerciseId, {
      attributes: ['id', 'name', 'thumbnailUrl', 'visibility', 'ownerId'],
    });
    if (
      !exercise ||
      (exercise.visibility === 'PRIVATE' && exercise.ownerId !== userId)
    ) {
      throw new NotFoundException('Exercise not found.');
    }
    // Append at the end of the existing order.
    const last = await this.loggedExerciseModel.max('orderIndex', {
      where: { workoutLogId },
    });
    const orderIndex = last == null ? 0 : Number(last) + 1;
    return this.loggedExerciseModel.create({
      workoutLogId,
      exerciseId,
      assignedExerciseId: null,
      exerciseNameSnapshot: exercise.name,
      exerciseThumbnailUrlSnapshot: exercise.thumbnailUrl,
      orderIndex,
      supersetGroupId: null,
      notes: null,
    });
  }

  /**
   * Remove a logged exercise (and CASCADE its sets) from a session.
   * The S14 "skip exercise" lives on top of this. Refuses on completed
   * logs since they're frozen history.
   */
  async removeExerciseFromLog(
    workoutLogId: string,
    loggedExerciseId: string,
    userId: string,
  ): Promise<void> {
    const log = await this._loadOwnedLog(workoutLogId, userId);
    if (log.status !== WorkoutLogStatus.InProgress) {
      throw new BadRequestException(
        'Cannot edit a workout that is no longer in progress.',
      );
    }
    const ex = await this.loggedExerciseModel.findByPk(loggedExerciseId);
    if (!ex || ex.workoutLogId !== workoutLogId) {
      throw new NotFoundException('Logged exercise not found.');
    }
    await ex.destroy();
  }

  /**
   * Append an empty set to a logged exercise. Used by:
   *   - the per-exercise "+ Add set" CTA (S14)
   *   - freestyle exercises that don't pre-seed any sets
   *
   * Set type defaults to NORMAL; actuals + targets are null until the
   * client logs them via `logSet`.
   */
  async addSetToLog(
    workoutLogId: string,
    loggedExerciseId: string,
    dto: { setType?: string },
    userId: string,
  ): Promise<LoggedSet> {
    const log = await this._loadOwnedLog(workoutLogId, userId);
    if (log.status !== WorkoutLogStatus.InProgress) {
      throw new BadRequestException(
        'Cannot add sets to a workout that is no longer in progress.',
      );
    }
    const ex = await this.loggedExerciseModel.findByPk(loggedExerciseId);
    if (!ex || ex.workoutLogId !== workoutLogId) {
      throw new NotFoundException('Logged exercise not found.');
    }
    const last = await this.loggedSetModel.max('orderIndex', {
      where: { loggedExerciseId },
    });
    const orderIndex = last == null ? 0 : Number(last) + 1;
    return this.loggedSetModel.create({
      loggedExerciseId,
      assignedSetId: null,
      orderIndex,
      setType: dto.setType ?? 'NORMAL',
      isCompleted: false,
    });
  }

  /**
   * "Last time you did this" — most-recent completed log set for this
   * exercise. Powers the `LastTimeHint` component on the active log.
   * Returns up to 6 actual rows (one workout's worth), newest first.
   */
  async lastSessionForExercise(
    userId: string,
    exerciseId: string,
  ): Promise<LoggedSet[]> {
    // Find the most-recent completed logged_exercise row for this user
    // + exercise. Cheaper than a nested include subquery (Sequelize
    // mangles the outer ORDER BY when attributes are restricted).
    const recent = (await this.loggedExerciseModel.findOne({
      where: { exerciseId },
      include: [
        {
          model: WorkoutLog,
          as: 'log',
          required: true,
          where: { userId, status: WorkoutLogStatus.Completed },
          attributes: ['id', 'completedAt'],
        },
      ],
      order: [[{ model: WorkoutLog, as: 'log' }, 'completedAt', 'DESC']],
    })) as (LoggedExercise & { log?: WorkoutLog }) | null;
    if (!recent) return [];
    return this.loggedSetModel.findAll({
      where: { loggedExerciseId: recent.id, isCompleted: true },
      order: [['orderIndex', 'ASC']],
      limit: 6,
    });
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

      // PR detection — Epley-estimate a 1RM for every loaded set
      // logged in this session and write a new one_rep_max row when it
      // tops the user's prior best for that exercise. The completed-at
      // timestamp on the row is the workout's completedAt so a GET on
      // the log can find the new PRs by time-window.
      await this._writePrsFromLog(log.id, userId, completedAt, tx);
    });

    return log;
  }

  /**
   * Walk every loaded set in `workoutLogId`, Epley-estimate its 1RM,
   * compare against the user's best for that exercise, and insert a
   * new one_rep_max row when it's a record. Same tx as `complete()`
   * so a rollback unwinds the PRs too.
   */
  private async _writePrsFromLog(
    workoutLogId: string,
    userId: string,
    recordedAt: Date,
    tx: Transaction,
  ): Promise<void> {
    const exercises = await this.loggedExerciseModel.findAll({
      where: { workoutLogId },
      include: [{ model: LoggedSet, as: 'sets' }],
      transaction: tx,
    });

    // Best estimated 1RM per exercise from this session.
    const sessionBest = new Map<string, number>();
    for (const ex of exercises) {
      if (!ex.exerciseId) continue;
      let best = 0;
      for (const s of ex.sets ?? []) {
        if (!s.isCompleted) continue;
        const est = this.estimateOneRepMaxEpley(s.reps, s.weightKg);
        if (est != null && est > best) best = est;
      }
      if (best > 0) sessionBest.set(ex.exerciseId, best);
    }
    if (sessionBest.size === 0) return;

    // Look up prior bests in a single query.
    const priorRows = await this.oneRepMaxModel.findAll({
      where: {
        userId,
        exerciseId: { [Op.in]: Array.from(sessionBest.keys()) },
      },
      attributes: ['exerciseId', 'weightKg'],
      transaction: tx,
    });
    const priorBest = new Map<string, number>();
    for (const r of priorRows) {
      const cur = priorBest.get(r.exerciseId) ?? 0;
      if (r.weightKg > cur) priorBest.set(r.exerciseId, r.weightKg);
    }

    for (const [exerciseId, estimated] of sessionBest) {
      const prior = priorBest.get(exerciseId) ?? 0;
      if (estimated <= prior) continue;
      await this.oneRepMaxModel.create(
        {
          userId,
          exerciseId,
          weightKg: estimated,
          source: OneRepMaxSource.EstimatedEpley,
          recordedAt,
          notes: null,
        },
        { transaction: tx },
      );
    }
  }

  /**
   * Find the one_rep_max rows that were written during this log's
   * session (between startedAt and completedAt, inclusive) so the FE
   * can render them on the workout-complete screen. Returns an empty
   * array when the log isn't completed yet or hit no PRs.
   */
  private async _findSessionPrs(log: WorkoutLog): Promise<
    {
      id: string;
      exerciseId: string;
      exerciseName: string;
      weightKg: number;
      deltaKg: number;
    }[]
  > {
    if (log.status !== WorkoutLogStatus.Completed || !log.completedAt) {
      return [];
    }
    const rows = await this.oneRepMaxModel.findAll({
      where: {
        userId: log.userId,
        source: OneRepMaxSource.EstimatedEpley,
        recordedAt: {
          [Op.gte]: log.startedAt,
          [Op.lte]: log.completedAt,
        },
      },
      include: [
        {
          model: Exercise,
          as: 'exercise',
          attributes: ['id', 'name'],
        },
      ],
    });

    // For the delta, fetch each exercise's previous best (before this
    // PR was set). Cheap query — most workouts hit ≤3 PRs.
    return Promise.all(
      rows.map(async (pr) => {
        const prior = await this.oneRepMaxModel.findOne({
          where: {
            userId: log.userId,
            exerciseId: pr.exerciseId,
            recordedAt: { [Op.lt]: pr.recordedAt },
          },
          order: [['weightKg', 'DESC']],
          attributes: ['weightKg'],
        });
        const deltaKg = prior
          ? Math.round((pr.weightKg - prior.weightKg) * 100) / 100
          : pr.weightKg;
        const exerciseName =
          (pr as unknown as { exercise?: { name?: string } }).exercise?.name ??
          'Exercise';
        return {
          id: pr.id,
          exerciseId: pr.exerciseId,
          exerciseName,
          weightKg: pr.weightKg,
          deltaKg,
        };
      }),
    );
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
    // History = completed sessions only. In-progress logs still surface
    // through the active log + plan detail, not here.
    const { rows, count } = await this.logModel.findAndCountAll({
      where: { userId, status: WorkoutLogStatus.Completed },
      include: [
        // Eager-load the program name so the row subtitle ("12-week
        // hypertrophy base · W5") doesn't need a follow-up fetch.
        // Nullable for freestyle logs.
        {
          model: ProgramAssignment,
          as: 'assignment',
          attributes: ['id', 'programNameSnapshot', 'masterProgramId'],
          required: false,
        },
        // Bring back logged_exercise → logged_set just for the count.
        // FE sums them client-side to render "18 sets".
        {
          model: LoggedExercise,
          as: 'exercises',
          attributes: ['id'],
          include: [
            {
              model: LoggedSet,
              as: 'sets',
              attributes: ['id', 'isCompleted'],
              required: false,
            },
          ],
          required: false,
        },
      ],
      order: [['startedAt', 'DESC']],
      offset: getOffset(page, limit),
      limit,
      distinct: true,
    });

    // Tag each row with the PR count for the session window. The
    // history view shows a "PR" trophy chip when this is > 0.
    // Sequelize instances drop arbitrary attached props on JSON
    // serialization, so we project to plain objects first.
    const prCounts =
      rows.length > 0
        ? await this._countSessionPrs(rows)
        : new Map<string, number>();
    const plainRows = rows.map((r) => {
      const plain = r.get({ plain: true }) as WorkoutLog & { prCount?: number };
      const n = prCounts.get(r.id) ?? 0;
      if (n > 0) plain.prCount = n;
      return plain;
    });
    return buildPaginatedResponse(plainRows, count, page, limit);
  }

  /**
   * Counts one_rep_max rows recorded within each log's session window
   * in a single query. Returns logId → count.
   */
  private async _countSessionPrs(
    logs: WorkoutLog[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const completedLogs = logs.filter(
      (l) => l.status === WorkoutLogStatus.Completed && l.completedAt,
    );
    if (completedLogs.length === 0) return map;

    // Build one large query that scans the time windows for this user.
    // Tiny dataset per page (≤ 30) so a per-log COUNT is fine.
    const userId = logs[0].userId;
    const candidateRows = await this.oneRepMaxModel.findAll({
      where: {
        userId,
        source: OneRepMaxSource.EstimatedEpley,
        recordedAt: {
          [Op.gte]: new Date(
            Math.min(...completedLogs.map((l) => l.startedAt.getTime())),
          ),
          [Op.lte]: new Date(
            Math.max(...completedLogs.map((l) => l.completedAt!.getTime())),
          ),
        },
      },
      attributes: ['recordedAt'],
    });
    for (const log of completedLogs) {
      const start = log.startedAt.getTime();
      const end = log.completedAt!.getTime();
      const n = candidateRows.filter((r) => {
        const t = r.recordedAt.getTime();
        return t >= start && t <= end;
      }).length;
      if (n > 0) map.set(log.id, n);
    }
    return map;
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
            // Eager-load the catalog exercise so the FE has name +
            // thumbnail without a second hop. `exerciseId` is nullable
            // on freestyle logs so `required: false` keeps the LEFT JOIN.
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
              required: false,
            },
            {
              model: LoggedSet,
              as: 'sets',
              separate: true,
              order: [['orderIndex', 'ASC']],
              include: [
                // Eager-load the prescription so the FE can render the
                // target column (reps range, weight, %1RM, etc.).
                // `assignedSet` is nullable for freestyle sets.
                {
                  model: AssignedSet,
                  as: 'assignedSet',
                  required: false,
                },
              ],
            },
          ],
        },
      ],
    });
    if (!log || log.userId !== userId) {
      throw new NotFoundException('Workout log not found.');
    }
    // Attach session PRs as a virtual property so the FE can render
    // the workout-complete trophy tile without a second hop. Sequelize
    // strips arbitrary props on JSON serialization, so we project to
    // a plain object first.
    const prs = await this._findSessionPrs(log);
    const plain = log.get({ plain: true }) as WorkoutLog & {
      personalRecords?: typeof prs;
    };
    if (prs.length > 0) plain.personalRecords = prs;
    return plain;
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
