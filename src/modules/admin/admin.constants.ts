/**
 * The six system role names (see migration 005). Used by admin DTOs to
 * validate role filters / assignments. Kept as a plain const array so
 * `@IsIn(ADMIN_ROLE_NAMES)` can reference it directly.
 */
export const ADMIN_ROLE_NAMES = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'INSTRUCTOR',
  'WRITER',
  'USER',
] as const;

export type AdminRoleName = (typeof ADMIN_ROLE_NAMES)[number];

/** Roles that may NEVER be impersonated (and that gate self-protection). */
export const PRIVILEGED_ROLE_NAMES: readonly string[] = [
  'SUPER_ADMIN',
  'ADMIN',
];

/**
 * Columns redacted from the read-only DB browser regardless of table.
 * Belt-and-braces on top of each table's explicit `redact` list: any
 * column whose snake_case name matches one of these is replaced with
 * '[REDACTED]'. Matched as a whole-word / suffix test in the service.
 */
export const GLOBAL_REDACT_PATTERNS: readonly RegExp[] = [
  /password/i,
  /token_hash$/i,
  /_secret$/i,
  /^secret$/i,
  /access_token/i,
  /refresh_token/i,
  /client_secret/i,
  /_token$/i,
  /verification_token/i,
];
