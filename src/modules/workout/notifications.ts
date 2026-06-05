import type { NotifyParams } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';

/**
 * Notification builders for the workout module.
 *
 * Builders take primitives — never Sequelize entities — so the
 * outbox can safely flush after the assignment tx commits without
 * triggering lazy-load explosions on dehydrated relations.
 *
 * Defaults (notification-defaults.ts):
 *   - PROGRAM_ASSIGNED → in-app + email
 */

/**
 * The client just had a program assigned by their instructor.
 *
 * Click target: `/my/plans/:assignmentId` — the client's plan detail
 * (ClientPlanDetail), reached the same way the "My plans" list links to
 * it. `screen` must match the live FE route, not a hypothetical one.
 */
export function programAssignedForClient(input: {
  clientId: string;
  assignmentId: string;
  programName: string;
  startDate: string;
  instructorName: string;
}): NotifyParams {
  return {
    userId: input.clientId,
    type: NotificationType.PROGRAM_ASSIGNED,
    title: 'New program assigned',
    body: `${input.instructorName} assigned you "${input.programName}", starting ${input.startDate}.`,
    data: {
      screen: 'my/plans',
      entityId: input.assignmentId,
    },
  };
}
