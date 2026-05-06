/**
 * Swagger doc objects for the AnalyticsController. Follows the same
 * shape as the rest of the `common/docs/*.docs.ts` files: each entry
 * is an `ApiEndpointOptions` object passed to `@ApiEndpoint(docs.x)`
 * on the route. Centralising them here keeps the controller skinny
 * and lets a future i18n / spec-export pass operate on one file per
 * module.
 */
export const AnalyticsDocs = {
  getInstructorSummary: {
    summary: 'Instructor summary',
    description:
      'Key metrics for the last 30 days: sessions, attendance rate, clients, groups.',
    auth: true,
    responses: [{ status: 200, description: 'Instructor analytics summary' }],
  },

  getUserActivity: {
    summary: 'My activity',
    description:
      'User activity summary for the last 30 days: attended sessions, attendance rate, groups.',
    auth: true,
    responses: [{ status: 200, description: 'User activity summary' }],
  },

  getPlatformStats: {
    summary: 'Platform statistics',
    description:
      'Platform-wide stats: users, instructors, groups, sessions. Admin only.',
    auth: true,
    responses: [{ status: 200, description: 'Platform statistics' }],
  },
};
