# Module Layout — NestJS File Plan

**Convention reference:** MotionHive `backend.md` skill + existing modules (`group/`, `session/`, `payment/`).

## High-level: two new modules

| Module | Lives at | Owns |
|---|---|---|
| **`exercise`** | `src/modules/exercise/` | Catalog (exercise, muscle, equipment, exercise_media), fork-to-customize, custom exercise CRUD |
| **`workout`** | `src/modules/workout/` | Programs, prescriptions, assignments (copy-on-assign), workout logs, one-rep-max history |

These are separate modules because:
- They have distinct ownership models (catalog is many-to-many global; programs are 1:N instructor-owned)
- Exercise is the dependency direction (workout imports from exercise; not vice versa)
- Future paid-content licensing might shard differently

## `exercise/` module structure

```
src/modules/exercise/
├── exercise.module.ts
├── exercise.controller.ts          # /exercises (instructor + client read)
├── exercise.service.ts             # CRUD, fork, search
├── muscle.controller.ts            # /muscles (public read)
├── muscle.service.ts
├── equipment.controller.ts         # /equipment (public read)
├── equipment.service.ts
├── notifications.ts                # buildExerciseForkedNotification(...)
├── entities/
│   ├── exercise.entity.ts
│   ├── muscle.entity.ts
│   ├── equipment.entity.ts
│   ├── exercise-muscle.entity.ts
│   ├── exercise-equipment.entity.ts
│   └── exercise-media.entity.ts
└── dto/
    ├── create-exercise.dto.ts
    ├── update-exercise.dto.ts
    ├── list-exercises.dto.ts       # extends PaginationDto; filter by kind/muscle/equipment/visibility/owner
    ├── fork-exercise.dto.ts
    └── exercise-response.dto.ts    # shape returned to FE
```

### Controllers

```ts
// exercise.controller.ts
@Controller('exercises')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiTags('Exercises')
export class ExerciseController {
  // GET /exercises  — paginated, filterable
  // GET /exercises/:id
  // POST /exercises — instructor creates custom (private or public)
  // PATCH /exercises/:id — owner only
  // DELETE /exercises/:id — soft-delete, owner only
  // POST /exercises/:id/fork — fork a public exercise into my private library
}

// muscle.controller.ts / equipment.controller.ts
@Controller('muscles')  // and /equipment
@ApiTags('Taxonomy')
export class MuscleController {
  // GET /muscles  — public list (used by FE filters)
}
```

### Service signatures

```ts
class ExerciseService {
  list(filter: ListExercisesDto, principal: AuthenticatedUser): Promise<Paginated<Exercise>>;
  findById(id: string, principal: AuthenticatedUser): Promise<Exercise>;
  create(dto: CreateExerciseDto, ownerId: string): Promise<Exercise>;
  update(id: string, dto: UpdateExerciseDto, principal: AuthenticatedUser): Promise<Exercise>;
  softDelete(id: string, principal: AuthenticatedUser): Promise<void>;
  fork(id: string, principal: AuthenticatedUser): Promise<Exercise>;
}
```

Ownership policy: use `assertOwned(...)` for INSTRUCTOR exercises with `'forbid'` mode. SYSTEM exercises are read-only except for SUPER_ADMIN (separate check in the service).

## `workout/` module structure

```
src/modules/workout/
├── workout.module.ts
├── program.controller.ts                    # /programs (instructor)
├── program.service.ts
├── program-assignment.controller.ts         # /program-assignments (instructor + client)
├── program-assignment.service.ts            # owns the copy-on-assign transaction
├── workout-log.controller.ts                # /workout-logs (client + instructor read-only)
├── workout-log.service.ts
├── one-rep-max.controller.ts                # /one-rep-maxes
├── one-rep-max.service.ts
├── notifications.ts                         # builders for PROGRAM_ASSIGNED, CLIENT_COMPLETED_WORKOUT
├── entities/
│   ├── program.entity.ts
│   ├── program-workout.entity.ts
│   ├── exercise-block.entity.ts
│   ├── prescribed-exercise.entity.ts
│   ├── prescribed-set.entity.ts
│   ├── program-assignment.entity.ts
│   ├── assigned-workout.entity.ts
│   ├── assigned-exercise.entity.ts
│   ├── assigned-set.entity.ts
│   ├── one-rep-max.entity.ts
│   ├── workout-log.entity.ts
│   ├── logged-exercise.entity.ts
│   └── logged-set.entity.ts
└── dto/
    ├── create-program.dto.ts
    ├── update-program.dto.ts
    ├── program-workout.dto.ts
    ├── prescribed-exercise.dto.ts
    ├── prescribed-set.dto.ts
    ├── list-programs.dto.ts                 # extends PaginationDto
    ├── assign-program.dto.ts                # body for POST /program-assignments
    ├── update-assigned-exercise.dto.ts      # per-client overrides
    ├── log-workout.dto.ts                   # body for starting a workout log
    ├── log-set.dto.ts                       # body for completing a set
    └── record-one-rep-max.dto.ts
```

### Controllers (instructor-facing)

```ts
// program.controller.ts
@Controller('programs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('INSTRUCTOR')
@ApiTags('Programs')
export class ProgramController {
  // GET /programs       — instructor's library
  // GET /programs/:id
  // POST /programs      — create empty program
  // PATCH /programs/:id
  // DELETE /programs/:id

  // Nested: program workouts (days)
  // POST /programs/:id/workouts
  // PATCH /programs/:id/workouts/:workoutId
  // DELETE /programs/:id/workouts/:workoutId

  // Nested: prescribed exercises
  // POST /programs/:id/workouts/:workoutId/exercises
  // PATCH /programs/:id/workouts/:workoutId/exercises/:exerciseId
  // DELETE /programs/:id/workouts/:workoutId/exercises/:exerciseId

  // Nested: prescribed sets
  // POST /programs/:id/workouts/:workoutId/exercises/:exerciseId/sets
  // PATCH /programs/:id/workouts/:workoutId/exercises/:exerciseId/sets/:setId
  // DELETE /programs/:id/workouts/:workoutId/exercises/:exerciseId/sets/:setId
}
```

### Controllers (assignment)

```ts
// program-assignment.controller.ts
@Controller('program-assignments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiTags('Program Assignments')
export class ProgramAssignmentController {
  // INSTRUCTOR endpoints
  @Roles('INSTRUCTOR')
  // POST /program-assignments       — assign program to a client (triggers copy-on-assign)
  // GET /program-assignments         — instructor's view of all their client assignments
  // PATCH /program-assignments/:id  — update status (PAUSE/CANCEL), notes
  // DELETE /program-assignments/:id  — soft-delete
  // PATCH /program-assignments/:id/workouts/:workoutId/exercises/:exerciseId — per-client override

  // CLIENT endpoints
  @Roles('USER')
  // GET /my/program-assignments      — client's assigned programs
  // GET /my/program-assignments/:id  — single assignment with nested workouts
}
```

### Controllers (logging)

```ts
// workout-log.controller.ts
@Controller('workout-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiTags('Workout Logs')
export class WorkoutLogController {
  @Roles('USER')
  // POST /workout-logs                 — start a workout (from assignment or freestyle)
  // PATCH /workout-logs/:id            — update notes, feeling, etc.
  // POST /workout-logs/:id/complete    — mark workout finished
  // PATCH /workout-logs/:id/exercises/:exerciseId/sets/:setId  — log a set

  @Roles('INSTRUCTOR')
  // GET /workout-logs/by-client/:clientId  — instructor sees a client's logs
}

// one-rep-max.controller.ts
@Controller('one-rep-maxes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('USER')
@ApiTags('One-Rep Max')
export class OneRepMaxController {
  // GET /my/one-rep-maxes
  // GET /my/one-rep-maxes/exercise/:exerciseId  — latest 1RM for this exercise
  // POST /my/one-rep-maxes                       — record new 1RM
  // DELETE /my/one-rep-maxes/:id                 — delete (correct a typo)
}
```

### Service layer key methods

```ts
class ProgramAssignmentService {
  // The big one — wraps everything in a single transaction
  assignProgramToClient(
    instructorId: string,
    clientId: string,
    programId: string,
    startDate: Date,
  ): Promise<ProgramAssignment>;
  //
  // Inside the transaction:
  //   1. Load program with all nested children
  //   2. Create program_assignment row
  //   3. Deep-copy each program_workout → assigned_workout (compute scheduled_date)
  //   4. Deep-copy each prescribed_exercise → assigned_exercise
  //   5. Deep-copy each prescribed_set → assigned_set
  //   6. After commit: outbox.flush() — fires PROGRAM_ASSIGNED notification
}

class WorkoutLogService {
  startWorkoutFromAssignment(userId: string, assignedWorkoutId: string): Promise<WorkoutLog>;
  // Inside transaction:
  //   1. Load assigned_workout with all nested assigned_set rows
  //   2. For each set with target_weight_percent_1rm: resolve from latest one_rep_max
  //   3. Create workout_log + logged_exercise + logged_set rows (sets uncompleted)
  //   4. Update assigned_workout.status = 'IN_PROGRESS'

  completeWorkout(userId: string, workoutLogId: string): Promise<WorkoutLog>;
  // Updates status, computes duration_seconds, snapshots exercise_name and thumbnail onto logged_exercise.
  // After commit: outbox.flush() — fires CLIENT_COMPLETED_WORKOUT notification to instructor (if assignment-based).
}
```

## Module wiring

```ts
// app.module.ts (additions)
@Module({
  imports: [
    // existing...
    ExerciseModule,
    WorkoutModule,
  ],
})
export class AppModule {}
```

## Swagger docs

One docs file per module:

```
src/common/docs/
├── exercise.docs.ts       # endpoint descriptions for /exercises, /muscles, /equipment
└── workout.docs.ts        # endpoint descriptions for /programs, /program-assignments, /workout-logs, /one-rep-maxes
```

Each endpoint uses `@ApiEndpoint(ExerciseDocs.list)` etc. — no inline `@ApiEndpoint({...})` blocks. This is a MotionHive convention from `backend.md`.

## Notification additions

In `notification.service.ts`, add to the `NotificationType` enum:

```ts
PROGRAM_ASSIGNED = 'PROGRAM_ASSIGNED',
EXERCISE_FORKED = 'EXERCISE_FORKED',
CLIENT_COMPLETED_WORKOUT = 'CLIENT_COMPLETED_WORKOUT',
// Stubs for future jobs module (do NOT fire from any service yet):
WORKOUT_DUE_TODAY = 'WORKOUT_DUE_TODAY',
WORKOUT_OVERDUE = 'WORKOUT_OVERDUE',
```

Builders go in `exercise/notifications.ts` and `workout/notifications.ts`:

```ts
// workout/notifications.ts
export function buildProgramAssignedNotification(
  programName: string,
  startDate: Date,
  assignmentId: string,
): NotificationPayload {
  return {
    type: 'PROGRAM_ASSIGNED',
    title: 'New program assigned',
    body: `You've been assigned "${programName}" starting ${formatDueDate(startDate)}.`,
    data: {
      screen: 'workouts',
      queryParams: { assignmentId },
    },
  };
}
```

## Search indexing call sites

`ExerciseService` and `ProgramService` both `await this.searchService.upsertDoc(...)` after their create/update and `await this.searchService.deleteDoc(...)` after their soft-delete, **after the transaction commits** (use `outbox` pattern).

Visibility filter on search side: client-facing search excludes `entity_type='exercise' AND visibility='PRIVATE' AND owner_id != current_user` etc.

## Test coverage targets

| Layer | Tests |
|---|---|
| `ExerciseService` | CRUD, fork, ownership enforcement, source-based mutation rules |
| `ProgramService` | CRUD, nested workout/exercise/set CRUD |
| `ProgramAssignmentService` | Deep-copy correctness, transaction rollback, %1RM resolution at start |
| `WorkoutLogService` | Start from assignment, freestyle log, snapshot fidelity on complete |
| `OneRepMaxService` | Latest 1RM lookup |

Match `client.service.spec.ts` style. Each test file under the module's own folder.

## What lives outside these modules

- **`user` module** — no schema change. Instructors and clients already exist as users with roles.
- **`client` module** — `instructor_client.id` is referenced from `program_assignment.instructor_client_id` (nullable). No changes needed.
- **`session` module** — completely untouched.
- **`notification` module** — only enum additions; no new builders need a home in the notification module itself.
- **`search` module** — only new call sites in our services; no new search engine work.
- **`cloudinary.service.ts`** — used as-is for thumbnail uploads.
- **`jobs` module** — pending. `WORKOUT_DUE_TODAY` / `WORKOUT_OVERDUE` notifications remain dormant until the jobs module ships.

## Migration ordering

Single migration file: `046_workouts_foundation.sql` (or next available number).

```sql
BEGIN;

-- 1. Enum types (CREATE TYPE)
-- 2. Taxonomy tables (muscle, equipment) — with INSERT seed rows
-- 3. Exercise tables (exercise, exercise_muscle, exercise_equipment, exercise_media)
-- 4. Program tables (program, program_workout, exercise_block, prescribed_exercise, prescribed_set)
-- 5. Assignment tables (program_assignment, assigned_workout, assigned_exercise, assigned_set)
-- 6. One-rep-max
-- 7. Workout log tables (workout_log, logged_exercise, logged_set)
-- 8. All indexes
-- 9. All check constraints (where not inline)

COMMIT;
```

Seed of Free Exercise DB happens **outside the migration** — via `scripts/seed-exercises.ts` so re-running it is idempotent and doesn't bloat the SQL file. Run it once per environment after the migration lands.

## Estimated implementation effort

| Block | Hours |
|---|---|
| Migration SQL | 2–3 |
| Sequelize entities (19 entities) | 3–4 |
| DTOs + validation | 3–4 |
| `ExerciseService` + controller | 4–5 |
| `ProgramService` + controller (with nested CRUD) | 6–8 |
| `ProgramAssignmentService` (copy-on-assign) | 4–5 |
| `WorkoutLogService` (with %1RM resolution) | 4–5 |
| `OneRepMaxService` | 1–2 |
| Swagger docs | 2 |
| Notification builders + wiring | 2 |
| Free Exercise DB seed script | 4–6 (incl. Cloudinary upload throughput) |
| Tests | 6–8 |
| **Total** | **~40–55 hours** |

That's 1–2 weeks of focused work. Plan to ship behind a feature flag if you want to overlap with other priorities.
