/**
 * Swagger doc objects for the SearchController.
 */
export const SearchDocs = {
  search: {
    summary: 'Global search',
    description:
      'Returns category-grouped results across users, instructors, groups, and sessions. Visibility filtered to the viewer.',
    auth: true,
    responses: [{ status: 200, description: 'Grouped search results' }],
  },

  reindex: {
    summary: 'Reindex search_doc (admin)',
    description:
      'Rebuilds the global search index from source tables. SUPER_ADMIN only. Idempotent. Use after a schema migration or to recover from suspected drift.',
    auth: true,
    responses: [
      { status: 200, description: 'Index rebuilt successfully' },
      { status: 403, description: 'Caller is not a SUPER_ADMIN' },
    ],
  },
};
