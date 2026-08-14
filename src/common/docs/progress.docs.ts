/**
 * Swagger doc objects for the ProgressController. Same shape as the
 * rest of `common/docs/*.docs.ts`: each entry is an
 * `ApiEndpointOptions` passed to `@ApiEndpoint(docs.x)` on the route.
 */
export const ProgressDocs = {
  overview: {
    summary: 'My training progress',
    description:
      'Derived summary for the signed-in user: workouts, volume, streak, ' +
      'weekly trend, daily activity and personal records. Volume counts ' +
      'only completed sets carrying a load, so bodyweight and cardio do ' +
      'not inflate it. Streaks and records ignore the range window.',
    auth: true,
    responses: [{ status: 200, description: 'Progress overview' }],
  },

  roster: {
    summary: "My clients' adherence",
    description:
      'Roster-level view for a coach: who is on track and who is ' +
      'slipping, without opening each client. A read-model over assigned ' +
      'workout statuses and logs — nothing is captured specially for it. ' +
      'Scoped to ACTIVE coaching relationships only. Clients needing ' +
      'attention sort first, each with a single reason.',
    auth: true,
    responses: [{ status: 200, description: 'Roster adherence summary' }],
  },

  exerciseHistory: {
    summary: 'My history for one exercise',
    description:
      'Estimated 1RM series (oldest first) plus every completed session ' +
      'of this exercise with its top set, newest first. Capped at 100 ' +
      'sessions.',
    auth: true,
    responses: [
      { status: 200, description: 'Per-exercise history' },
      { status: 404, description: 'Exercise not found' },
    ],
  },
};
