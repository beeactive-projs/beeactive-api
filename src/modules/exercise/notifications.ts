import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';

/**
 * Notification builders for the exercise module.
 *
 * Builders take **primitives** (id, name, slug) — never Sequelize
 * entities. Lazy associations on an entity passed across a tx
 * boundary would explode when the outbox flushes after commit.
 *
 * Defaults (`notification-defaults.ts`):
 *   - EXERCISE_FORKED → in-app only
 *     (fork notifications can be high-volume for popular public
 *     exercises; email by default would create inbox noise)
 *
 * Click target: `/coaching/exercises` — the exercise catalog. There is
 * no per-exercise detail *route* on the FE (detail opens as a dialog),
 * so we land on the catalog rather than a non-existent `/exercises/:id`.
 */

/**
 * Original author was just forked.
 *
 * Fires AFTER the fork transaction commits — use the outbox pattern
 * to avoid orphaning the alert if the tx rolls back. See `notify-after-commit`
 * in the service for the canonical example.
 */
export function exerciseForkedForOwner(input: {
  ownerId: string;
  exerciseId: string;
  exerciseName: string;
  forkedByName: string;
  newForkCount: number;
}): NotifyParams {
  return {
    userId: input.ownerId,
    type: NotificationType.EXERCISE_FORKED,
    title: 'Your exercise was forked',
    body: `${input.forkedByName} forked "${input.exerciseName}" into their library. ${input.newForkCount} ${input.newForkCount === 1 ? 'fork' : 'forks'} total.`,
    // No entityId — the catalog has no per-exercise route to deep-link to.
    data: {
      screen: 'coaching/exercises',
    },
  };
}
