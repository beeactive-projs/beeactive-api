// Workout module enums — single source of truth for entities + DTOs.
// Const + type pattern (runtime accessible + TS narrowing). Keep in
// sync with migration 047.

export const ProgramKind = {
  Workout: 'WORKOUT',
  Meal: 'MEAL', // reserved
  Habit: 'HABIT', // reserved
  Hybrid: 'HYBRID', // reserved
} as const;
export type ProgramKind = (typeof ProgramKind)[keyof typeof ProgramKind];

export const ProgramStatus = {
  Draft: 'DRAFT',
  Published: 'PUBLISHED',
  Archived: 'ARCHIVED',
} as const;
export type ProgramStatus = (typeof ProgramStatus)[keyof typeof ProgramStatus];

export const ProgramAssignmentStatus = {
  Pending: 'PENDING',
  Active: 'ACTIVE',
  Completed: 'COMPLETED',
  Paused: 'PAUSED',
  Cancelled: 'CANCELLED',
} as const;
export type ProgramAssignmentStatus =
  (typeof ProgramAssignmentStatus)[keyof typeof ProgramAssignmentStatus];

export const WorkoutLogStatus = {
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Skipped: 'SKIPPED',
  Abandoned: 'ABANDONED',
} as const;
export type WorkoutLogStatus =
  (typeof WorkoutLogStatus)[keyof typeof WorkoutLogStatus];

export const ExerciseBlockKind = {
  None: 'NONE',
  Superset: 'SUPERSET',
  Circuit: 'CIRCUIT',
  Emom: 'EMOM',
  Amrap: 'AMRAP',
  Tabata: 'TABATA',
} as const;
export type ExerciseBlockKind =
  (typeof ExerciseBlockKind)[keyof typeof ExerciseBlockKind];

export const ExerciseSetType = {
  Normal: 'NORMAL',
  Warmup: 'WARMUP',
  Working: 'WORKING',
  Dropset: 'DROPSET',
  Failure: 'FAILURE',
  Amrap: 'AMRAP',
  RestPause: 'REST_PAUSE',
  Cluster: 'CLUSTER',
} as const;
export type ExerciseSetType =
  (typeof ExerciseSetType)[keyof typeof ExerciseSetType];

export const OneRepMaxSource = {
  Tested: 'TESTED',
  EstimatedEpley: 'ESTIMATED_EPLEY',
  EstimatedBrzycki: 'ESTIMATED_BRZYCKI',
  Manual: 'MANUAL',
} as const;
export type OneRepMaxSource =
  (typeof OneRepMaxSource)[keyof typeof OneRepMaxSource];
