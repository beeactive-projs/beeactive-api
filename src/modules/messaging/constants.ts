import { createHash } from 'crypto';

/**
 * Module-wide messaging constants. Single source of truth so the FE
 * contract, the moderation views, and the service's tombstone all
 * agree on the same string.
 */

/**
 * Body string written when a message is soft-deleted (by sender) or
 * removed (by moderator). The row stays for thread continuity; the
 * plaintext is gone.
 *
 * The FE renders this verbatim — keep it user-facing.
 */
export const DELETED_MESSAGE_BODY = '[deleted]';

/**
 * Deterministic direct-conversation key for a pair of users.
 *
 * Used by `findOrCreateDirectConversation` to dedupe concurrent first-
 * sends from opposite sides via a partial UNIQUE index on
 * `conversation.direct_key` (migration 039). The exact algorithm here
 * MUST match the backfill in 039_messaging_direct_key.sql so existing
 * rows and new rows produce the same key.
 *
 * Format: `sha256(sortedA + ':' + sortedB)` as hex.
 */
export function directKeyFor(userA: string, userB: string): string {
  const [a, b] = [userA, userB].sort();
  return createHash('sha256').update(`${a}:${b}`).digest('hex');
}
