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
 *   - CLIENT_COMPLETED_WORKOUT → in-app only
 *   - CLIENT_COMPLETED_PLAN → in-app + email
 */

/**
 * The client just had a program assigned by their instructor.
 *
 * Click target: `/user/plans/:assignmentId` — the client's plan detail
 * (ClientPlanDetail). The route lives under /user/* after the IA
 * refactor; the old /my/plans path was never given a redirect so
 * navigating there does nothing.
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
      screen: 'user/plans',
      entityId: input.assignmentId,
    },
  };
}

/**
 * A client finished a workout from a program their coach assigned.
 *
 * Without this the coaching loop never closes: someone trains, and
 * nothing reaches the person who wrote the plan. It was in the V1 scope
 * list and never got wired.
 *
 * Only fires for assigned work. Freestyle training is the client's own
 * business unless they opt into sharing it (`shareOffPlan`).
 *
 * Click target: the coach's read-only replay of that session.
 */
export function clientCompletedWorkoutForInstructor(input: {
  instructorId: string;
  workoutLogId: string;
  clientName: string;
  workoutName: string;
  setsCompleted: number;
}): NotifyParams {
  const sets =
    input.setsCompleted === 1 ? '1 set' : `${input.setsCompleted} sets`;
  return {
    userId: input.instructorId,
    type: NotificationType.CLIENT_COMPLETED_WORKOUT,
    title: `${input.clientName} finished a workout`,
    body: `${input.workoutName} is logged, ${sets} completed.`,
    data: {
      screen: 'coaching/clients',
      entityId: input.workoutLogId,
    },
  };
}

/**
 * A client just finished every workout in a plan you assigned.
 *
 * Emailed as well as in-app, unlike the per-workout notification: this
 * happens a few times a year rather than several times a week, and it
 * is the moment the coach has something to do — debrief, and decide
 * what comes next.
 *
 * Click target: the client's profile, where the plan and its history
 * already live.
 */
export function clientCompletedPlanForInstructor(input: {
  instructorId: string;
  clientId: string;
  clientName: string;
  programName: string;
  workoutsCompleted: number;
}): NotifyParams {
  const sessions =
    input.workoutsCompleted === 1
      ? '1 session'
      : `${input.workoutsCompleted} sessions`;
  return {
    userId: input.instructorId,
    type: NotificationType.CLIENT_COMPLETED_PLAN,
    title: `${input.clientName} finished ${input.programName}`,
    body: `All ${sessions} done. Time to debrief and set what comes next.`,
    data: {
      screen: 'coaching/clients',
      entityId: input.clientId,
    },
  };
}
