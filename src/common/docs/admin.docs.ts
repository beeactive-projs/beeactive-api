/**
 * Swagger doc objects for the admin module controllers. Same shape as the
 * other `common/docs/*.docs.ts` files — each entry is an
 * `ApiEndpointOptions` passed to `@ApiEndpoint(AdminDocs.x)`.
 */
export const AdminDocs = {
  // ── Users ────────────────────────────────────────────────────────
  listUsers: {
    summary: 'List users (cross-tenant)',
    description:
      'Paginated, filterable list of ALL users. Filters: q, role, isActive, isEmailVerified, locked, includeDeleted, onlyDeleted. ADMIN+.',
    auth: true,
    responses: [{ status: 200, description: 'Paginated users' }],
  },
  getUserDetail: {
    summary: 'User detail',
    description:
      'Full admin view of a user: roles, instructor profile, group/session/client counts, Stripe onboarding state, last-session metadata. ADMIN+.',
    auth: true,
    responses: [{ status: 200, description: 'User detail' }],
  },
  updateUserStatus: {
    summary: 'Update user status',
    description:
      'Activate/deactivate, unlock (clear lockout), or force email-verified. ADMIN+.',
    auth: true,
    responses: [{ status: 200, description: 'Updated user detail' }],
  },
  assignRole: {
    summary: 'Assign role',
    description: 'Grant a system role to a user. SUPER_ADMIN only.',
    auth: true,
    responses: [{ status: 201, description: 'Updated role list' }],
  },
  revokeRole: {
    summary: 'Revoke role',
    description:
      "Remove a system role from a user (cannot revoke own admin role or a user's last role). SUPER_ADMIN only.",
    auth: true,
    responses: [{ status: 200, description: 'Updated role list' }],
  },
  restoreUser: {
    summary: 'Restore deleted user',
    description: 'Undo a soft-delete (paranoid restore). SUPER_ADMIN only.',
    auth: true,
    responses: [{ status: 200, description: 'Restored user detail' }],
  },

  // ── Impersonation ────────────────────────────────────────────────
  impersonate: {
    summary: 'Impersonate user',
    description:
      'Mint a short-lived (30m), refresh-less access token acting as the target user. Rejects self and admin targets. Audited. SUPER_ADMIN only.',
    auth: true,
    responses: [
      { status: 201, description: 'Impersonation token + target user' },
    ],
  },

  // ── DB browser ───────────────────────────────────────────────────
  listDbTables: {
    summary: 'List browsable tables',
    description:
      'Whitelisted read-only tables with row counts. SUPER_ADMIN only.',
    auth: true,
    responses: [{ status: 200, description: 'Table list' }],
  },
  getDbRows: {
    summary: 'Browse table rows',
    description:
      'Paginated, read-only rows for a whitelisted table; secret columns redacted. SUPER_ADMIN only.',
    auth: true,
    responses: [{ status: 200, description: 'Paginated rows' }],
  },

  // ── Overview ─────────────────────────────────────────────────────
  getOverview: {
    summary: 'Platform overview',
    description:
      'Dashboard counts: users (total/active/deleted), instructors, groups, sessions, active subs, open disputes, failed webhooks, open reports. ADMIN+.',
    auth: true,
    responses: [{ status: 200, description: 'Overview counts' }],
  },
};
