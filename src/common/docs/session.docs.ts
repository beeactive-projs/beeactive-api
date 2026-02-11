/**
 * API Documentation for Session endpoints
 * Centralized location for all session-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const SessionDocs = {
  create: {
    summary: 'Create a new session',
    description:
      'Create a training session. Requires ORGANIZER role. If organization_id is provided, you must be a member.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Session created successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Morning Yoga Flow',
          session_type: 'GROUP',
          visibility: 'MEMBERS',
          scheduled_at: '2026-02-15T09:00:00.000Z',
          duration_minutes: 60,
          status: 'SCHEDULED',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getMySessions: {
    summary: 'List my visible sessions',
    description:
      'Returns all sessions visible to you: your own sessions, org MEMBERS sessions, PUBLIC sessions, and sessions you joined.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Sessions listed',
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  getById: {
    summary: 'Get session details',
    description:
      'Returns full session details including participants. Access controlled by visibility rules.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Session details retrieved',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  update: {
    summary: 'Update session',
    description: 'Update session details. Organizer only.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Session updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  delete: {
    summary: 'Delete session',
    description: 'Soft-delete a session. Organizer only.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Session deleted',
        example: { message: 'Session deleted successfully' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  joinSession: {
    summary: 'Join a session',
    description:
      'Register as a participant. Checks visibility rules and capacity.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Successfully joined session',
        example: {
          id: 'participant-uuid',
          session_id: 'session-uuid',
          user_id: 'user-uuid',
          status: 'REGISTERED',
        },
      },
      {
        status: 400,
        description: 'Already registered, session full, or own session',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  leaveSession: {
    summary: 'Leave a session',
    description: 'Cancel your registration for a session.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Successfully left session',
        example: { message: 'You have left the session' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateParticipantStatus: {
    summary: 'Update participant status',
    description:
      "Change a participant's status (e.g., mark as ATTENDED, NO_SHOW). Organizer only.",
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Participant status updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
