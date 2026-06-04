import {
  BadRequestException,
  ForbiddenException,
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
  InstructorClient,
  InstructorClientStatus,
} from '../client/entities/instructor-client.entity';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../common/dto/pagination.dto';
import { Exercise } from '../exercise/entities/exercise.entity';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/entities/user.entity';
import { AssignedExercise } from './entities/assigned-exercise.entity';
import { AssignedSet } from './entities/assigned-set.entity';
import { AssignedWorkout } from './entities/assigned-workout.entity';
import { PrescribedExercise } from './entities/prescribed-exercise.entity';
import { PrescribedSet } from './entities/prescribed-set.entity';
import { Program } from './entities/program.entity';
import { ProgramAssignment } from './entities/program-assignment.entity';
import { ProgramWorkout } from './entities/program-workout.entity';
import {
  ProgramAssignmentStatus,
  WorkoutLogStatus,
} from './entities/workout.enums';
import { AssignProgramDto } from './dto/assign-program.dto';
import { ListAssignmentsQueryDto } from './dto/list-assignments.query.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { programAssignedForClient } from './notifications';

/**
 * ProgramAssignmentService — the copy-on-assign headliner (locked
 * decision §10). Atomically clones the entire program tree into the
 * `assigned_*` tables so the client's view is independent of the
 * master forever.
 *
 * Status lifecycle:
 *   PENDING → ACTIVE ↔ PAUSED → COMPLETED
 *                              ↘
 *                               CANCELLED   (terminal)
 *
 * V1 defaults new assignments to ACTIVE — the client should see them
 * immediately. PENDING is reserved for future "instructor sends an
 * invitation, client accepts" flows.
 */
@Injectable()
export class ProgramAssignmentService {
  constructor(
    @InjectModel(ProgramAssignment)
    private readonly assignmentModel: typeof ProgramAssignment,
    @InjectModel(AssignedWorkout)
    private readonly assignedWorkoutModel: typeof AssignedWorkout,
    @InjectModel(AssignedExercise)
    private readonly assignedExerciseModel: typeof AssignedExercise,
    @InjectModel(AssignedSet)
    private readonly assignedSetModel: typeof AssignedSet,
    @InjectModel(Program) private readonly programModel: typeof Program,
    @InjectModel(InstructorClient)
    private readonly instructorClientModel: typeof InstructorClient,
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly sequelize: Sequelize,
    private readonly notificationService: NotificationService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // The deep-copy headliner
  // ────────────────────────────────────────────────────────────────────

  /**
   * Atomically clone a program → assignment for a single client.
   *
   * Steps in one transaction:
   *   1. Load the master program with full include tree.
   *   2. Validate instructor owns the program + has an ACTIVE
   *      relationship with the client.
   *   3. Create `program_assignment` (status ACTIVE by default,
   *      snapshots program name).
   *   4. For each program_workout: create assigned_workout with
   *      `scheduled_date = start_date + week*7 + day`.
   *   5. For each prescribed_exercise: create assigned_exercise.
   *   6. For each prescribed_set: create assigned_set (targets
   *      copied verbatim; %1RM resolution defers to log start).
   *   7. After commit: notify the client.
   *
   * Rollback is automatic — any failure unwinds all writes.
   */
  async assignProgramToClient(
    instructorId: string,
    instructorName: string,
    dto: AssignProgramDto,
  ): Promise<ProgramAssignment> {
    const program = await this.programModel.findByPk(dto.programId, {
      include: [
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

    if (!program || program.ownerId !== instructorId) {
      throw new NotFoundException('Program not found.');
    }
    if (program.deletedAt) {
      throw new BadRequestException('Cannot assign a deleted program.');
    }

    // The client must be in an ACTIVE instructor↔client relationship.
    const relationship = await this.instructorClientModel.findOne({
      where: {
        instructorId,
        clientId: dto.clientId,
        status: InstructorClientStatus.ACTIVE,
      },
    });
    if (!relationship) {
      throw new ForbiddenException(
        'You can only assign programs to your active clients.',
      );
    }

    // Pull the client display name for the notification (we already
    // have instructorName via the controller).
    const client = await this.userModel.findByPk(dto.clientId, {
      attributes: ['id', 'firstName', 'lastName'],
    });
    if (!client) {
      throw new NotFoundException('Client not found.');
    }

    const created = await this.sequelize.transaction(async (tx) => {
      const assignment = await this.assignmentModel.create(
        {
          instructorId,
          clientId: dto.clientId,
          instructorClientId: relationship.id,
          masterProgramId: program.id,
          programNameSnapshot: program.name,
          status: ProgramAssignmentStatus.Active,
          startDate: dto.startDate,
          endDate: this.computeEndDate(program, dto.startDate),
          completionPercent: 0,
          notes: dto.notes?.trim() || null,
        },
        { transaction: tx },
      );

      await this.cloneTree(assignment.id, program, dto.startDate, tx);
      return assignment;
    });

    // notify-after-commit (best-effort — failure here doesn't roll the assignment back)
    try {
      const instructorDisplayName = instructorName.trim() || 'Your coach';
      await this.notificationService.notify(
        programAssignedForClient({
          clientId: dto.clientId,
          assignmentId: created.id,
          programName: program.name,
          startDate: dto.startDate,
          instructorName: instructorDisplayName,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `PROGRAM_ASSIGNED notification failed for ${created.id}: ${(err as Error).message}`,
        'ProgramAssignmentService',
      );
    }

    return created;
  }

  // ────────────────────────────────────────────────────────────────────
  // Listing / detail
  // ────────────────────────────────────────────────────────────────────

  async listForInstructor(
    instructorId: string,
    query: ListAssignmentsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      instructorId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
    };
    const { rows, count } = await this.assignmentModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl', 'handle'],
        },
      ],
      order: [['updatedAt', 'DESC']],
      offset: getOffset(page, limit),
      limit,
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async listForClient(clientId: string, query: ListAssignmentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      clientId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const { rows, count } = await this.assignmentModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'instructor',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl', 'handle'],
        },
      ],
      order: [['startDate', 'DESC']],
      offset: getOffset(page, limit),
      limit,
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  /**
   * Detail with full nested tree — readable by either party. 404 on
   * cross-tenant access (hides existence).
   */
  async findById(id: string, userId: string): Promise<ProgramAssignment> {
    const assignment = await this.assignmentModel.findByPk(id, {
      include: [
        {
          model: User,
          as: 'instructor',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl', 'handle'],
        },
        {
          model: User,
          as: 'client',
          attributes: ['id', 'firstName', 'lastName', 'avatarUrl', 'handle'],
        },
        {
          model: AssignedWorkout,
          as: 'workouts',
          separate: true,
          order: [['sequenceNumber', 'ASC']],
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
                  model: AssignedSet,
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
    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }
    if (assignment.instructorId !== userId && assignment.clientId !== userId) {
      throw new NotFoundException('Assignment not found.');
    }
    return assignment;
  }

  // ────────────────────────────────────────────────────────────────────
  // Mutations
  // ────────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    instructorId: string,
  ): Promise<ProgramAssignment> {
    const assignment = await this._loadOwnedByInstructor(id, instructorId);
    if (dto.status) {
      this._assertStatusTransition(assignment.status, dto.status);
    }
    await assignment.update({
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
    });
    return assignment;
  }

  async softDelete(id: string, instructorId: string): Promise<void> {
    const assignment = await this._loadOwnedByInstructor(id, instructorId);
    await assignment.destroy();
  }

  /**
   * Client manually marks an assigned workout as skipped. Locked V1
   * decision: clients can skip ahead — no reason capture in V1. This
   * mirrors what the auto-skip cron would do once it lands.
   *
   * 404s on cross-tenant access (hides existence). Won't reopen a
   * COMPLETED workout (would lie about the client's history).
   */
  async skipAssignedWorkoutAsClient(
    assignedWorkoutId: string,
    clientId: string,
  ): Promise<AssignedWorkout> {
    const aw = await this.assignedWorkoutModel.findByPk(assignedWorkoutId, {
      include: [
        {
          model: this.assignmentModel,
          as: 'assignment',
          attributes: ['id', 'clientId'],
        },
      ],
    });
    if (!aw || !aw.assignment || aw.assignment.clientId !== clientId) {
      throw new NotFoundException('Workout not found.');
    }
    if (aw.status === WorkoutLogStatus.Completed) {
      throw new BadRequestException(
        "This workout is already complete and can't be skipped.",
      );
    }
    await aw.update({ status: WorkoutLogStatus.Skipped });
    // Bump completion% so the plan progress reflects the skip. SKIPPED
    // counts toward "this workout is done with" the same way COMPLETED
    // does — the client moves past it either way.
    await this._recomputeProgressForSkip(aw.programAssignmentId);
    return aw;
  }

  // ────────────────────────────────────────────────────────────────────
  // System sweeps (jobs module)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Skip never-started assigned workouts whose scheduled date is in the
   * past, for ACTIVE assignments only. Driven by the daily
   * `workouts.auto_skip_past_workouts` cron — the system equivalent of
   * `skipAssignedWorkoutAsClient`, reusing the same progress recompute.
   *
   * Only touches `status IS NULL` rows: an IN_PROGRESS log (client opened
   * it but didn't finish) is left alone — auto-skip must never clobber
   * real logged work. Per-assignment tx so the skip + recompute commit
   * together; the `status = null` guard in the UPDATE keeps it idempotent
   * across retries. Silent.
   *
   * @param today client-calendar date as `YYYY-MM-DD` (DATEONLY space).
   */
  async autoSkipPastWorkouts(
    today: string,
  ): Promise<{ skipped: number; assignmentsTouched: number }> {
    const candidates = await this.assignedWorkoutModel.findAll({
      where: { status: null, scheduledDate: { [Op.lt]: today } },
      include: [
        {
          model: this.assignmentModel,
          as: 'assignment',
          required: true,
          where: { status: ProgramAssignmentStatus.Active },
          attributes: ['id'],
        },
      ],
      attributes: ['id', 'programAssignmentId'],
    });
    if (candidates.length === 0) {
      return { skipped: 0, assignmentsTouched: 0 };
    }

    const byAssignment = new Map<string, string[]>();
    for (const c of candidates) {
      const list = byAssignment.get(c.programAssignmentId) ?? [];
      list.push(c.id);
      byAssignment.set(c.programAssignmentId, list);
    }

    let skipped = 0;
    for (const [assignmentId, workoutIds] of byAssignment) {
      await this.sequelize.transaction(async (tx) => {
        const [count] = await this.assignedWorkoutModel.update(
          { status: WorkoutLogStatus.Skipped },
          {
            where: { id: { [Op.in]: workoutIds }, status: null },
            transaction: tx,
          },
        );
        skipped += count;
        await this._recomputeProgressForSkip(assignmentId, tx);
      });
    }

    if (skipped > 0) {
      this.logger.log?.(
        `Auto-skipped ${skipped} past workout(s) across ${byAssignment.size} assignment(s)`,
        'ProgramAssignmentService',
      );
    }
    return { skipped, assignmentsTouched: byAssignment.size };
  }

  /**
   * Complete ACTIVE assignments whose every workout is now COMPLETED or
   * SKIPPED. Driven by the daily `workouts.auto_complete_assignments`
   * cron (scheduled after auto-skip so a same-day skip can finish the
   * plan). Skeleton assignments (zero workouts) never auto-complete.
   *
   * Idempotent: the `status = ACTIVE` guard on the UPDATE means a re-run
   * is a no-op. Silent — no new notification type in V1.
   */
  async autoCompleteAssignments(): Promise<{ completed: number }> {
    const active = await this.assignmentModel.findAll({
      where: { status: ProgramAssignmentStatus.Active },
      attributes: ['id'],
    });

    let completed = 0;
    for (const assignment of active) {
      const [total, outstanding] = await Promise.all([
        this.assignedWorkoutModel.count({
          where: { programAssignmentId: assignment.id },
        }),
        this.assignedWorkoutModel.count({
          where: {
            programAssignmentId: assignment.id,
            [Op.or]: [
              { status: null },
              {
                status: {
                  [Op.in]: [
                    WorkoutLogStatus.InProgress,
                    WorkoutLogStatus.Abandoned,
                  ],
                },
              },
            ],
          },
        }),
      ]);
      if (total === 0 || outstanding > 0) continue;

      const [n] = await this.assignmentModel.update(
        { status: ProgramAssignmentStatus.Completed },
        {
          where: {
            id: assignment.id,
            status: ProgramAssignmentStatus.Active,
          },
        },
      );
      completed += n;
    }

    if (completed > 0) {
      this.logger.log?.(
        `Auto-completed ${completed} assignment(s)`,
        'ProgramAssignmentService',
      );
    }
    return { completed };
  }

  private async _recomputeProgressForSkip(
    assignmentId: string,
    tx?: Transaction,
  ): Promise<void> {
    const [total, done] = await Promise.all([
      this.assignedWorkoutModel.count({
        where: { programAssignmentId: assignmentId },
        transaction: tx,
      }),
      this.assignedWorkoutModel.count({
        where: {
          programAssignmentId: assignmentId,
          status: {
            [Op.in]: [WorkoutLogStatus.Completed, WorkoutLogStatus.Skipped],
          },
        },
        transaction: tx,
      }),
    ]);
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    await this.assignmentModel.update(
      { completionPercent: percent },
      { where: { id: assignmentId }, transaction: tx },
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────

  private async cloneTree(
    assignmentId: string,
    program: Program,
    startDate: string,
    tx: Transaction,
  ): Promise<void> {
    const workouts = program.workouts ?? [];
    if (workouts.length === 0) {
      // Empty program is a UX choice — allow it (a "skeleton" program
      // an instructor will fill in later). No nested writes needed.
      return;
    }

    for (const pw of workouts) {
      const aw = await this.assignedWorkoutModel.create(
        {
          programAssignmentId: assignmentId,
          masterWorkoutId: pw.id,
          name: pw.name,
          notes: pw.notes,
          weekIndex: pw.weekIndex,
          dayIndex: pw.dayIndex,
          sequenceNumber: pw.sequenceNumber,
          phase: pw.phase,
          estimatedDurationMinutes: pw.estimatedDurationMinutes,
          scheduledDate: this.computeScheduledDate(startDate, pw),
          status: null,
        },
        { transaction: tx },
      );

      const exercises = pw.exercises ?? [];
      for (const pe of exercises) {
        const ae = await this.assignedExerciseModel.create(
          {
            assignedWorkoutId: aw.id,
            exerciseId: pe.exerciseId,
            masterExerciseId: pe.id,
            supersetGroupId: pe.supersetGroupId,
            orderIndex: pe.orderIndex,
            notes: pe.notes,
            alternateExerciseId: pe.alternateExerciseId,
            isModifiedFromMaster: false,
          },
          { transaction: tx },
        );

        const sets = pe.sets ?? [];
        if (sets.length === 0) continue;

        await this.assignedSetModel.bulkCreate(
          sets.map((ps) => ({
            assignedExerciseId: ae.id,
            masterSetId: ps.id,
            orderIndex: ps.orderIndex,
            setType: ps.setType,
            targetRepsMin: ps.targetRepsMin,
            targetRepsMax: ps.targetRepsMax,
            targetWeightKg: ps.targetWeightKg,
            targetWeightPercent1rm: ps.targetWeightPercent1rm,
            targetDurationSeconds: ps.targetDurationSeconds,
            targetDistanceMeters: ps.targetDistanceMeters,
            targetRpe: ps.targetRpe,
            targetRir: ps.targetRir,
            restAfterSeconds: ps.restAfterSeconds,
            tempo: ps.tempo,
            notes: ps.notes,
          })),
          { transaction: tx },
        );
      }
    }
  }

  private async _loadOwnedByInstructor(
    id: string,
    instructorId: string,
  ): Promise<ProgramAssignment> {
    const assignment = await this.assignmentModel.findByPk(id);
    if (!assignment || assignment.instructorId !== instructorId) {
      throw new NotFoundException('Assignment not found.');
    }
    return assignment;
  }

  /**
   * Day 0 of the program lands on `startDate`; advance one calendar
   * day per (week*7 + day). We keep the math in pure string-date
   * space so timezone is not a concern (`DATEONLY` storage).
   */
  private computeScheduledDate(startDate: string, pw: ProgramWorkout): string {
    const dayOffset = pw.weekIndex * 7 + pw.dayIndex;
    return this.addDays(startDate, dayOffset);
  }

  private computeEndDate(program: Program, startDate: string): string | null {
    if (!program.durationDays) return null;
    // End on the final day of the program.
    return this.addDays(startDate, program.durationDays - 1);
  }

  private addDays(isoDate: string, days: number): string {
    // Avoid Date timezone shenanigans by working in y-m-d arithmetic.
    const [y, m, d] = isoDate.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    utc.setUTCDate(utc.getUTCDate() + days);
    return utc.toISOString().slice(0, 10);
  }

  /**
   * Status transition gate. Terminal states (COMPLETED, CANCELLED)
   * cannot move backward. Anything else can flow freely.
   */
  private _assertStatusTransition(
    current: ProgramAssignmentStatus,
    next: ProgramAssignmentStatus,
  ): void {
    if (current === next) return;
    const terminal: ProgramAssignmentStatus[] = [
      ProgramAssignmentStatus.Completed,
      ProgramAssignmentStatus.Cancelled,
    ];
    if (terminal.includes(current)) {
      throw new BadRequestException(
        `Cannot transition out of a ${current} assignment.`,
      );
    }
  }
}
