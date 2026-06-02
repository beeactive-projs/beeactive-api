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
 * Click target: `/my/program-assignments/:id` — the client's
 * "today's workout" surface, gated by USER role on the FE.
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
      screen: 'assignments',
      entityId: input.assignmentId,
    },
  };
}
