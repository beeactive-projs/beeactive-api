/**
 * API Documentation for Session endpoints
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const SessionDocs = {
  create: {
    summary: 'Create a new session',
    description:
      'Create a training session. Requires ORGANIZER role. If organizationId is provided, you must be a member.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Session created successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Morning Yoga Flow',
          sessionType: 'GROUP',
          visibility: 'MEMBERS',
          scheduledAt: '2026-02-15T09:00:00.000Z',
          durationMinutes: 60,
          status: 'SCHEDULED',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getMySessions: {
    summary: 'List my visible sessions (paginated)',
    description:
      'Returns paginated sessions visible to you. Includes: your own sessions, org MEMBERS sessions, PUBLIC sessions, and sessions you joined.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Sessions listed',
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  discoverSessions: {
    summary: 'Discover public sessions',
    description:
      'Browse upcoming public sessions. Supports search by title, description, or location. Query params: ?search=yoga&page=1&limit=20.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Public sessions listed',
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
    description:
      'Update session details. Organizer only. If status is changed to CANCELLED, all participants are notified.',
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
    description:
      'Soft-delete a session. Organizer only. All registered participants are notified via email.',
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

  cloneSession: {
    summary: 'Clone/duplicate a session',
    description:
      'Create a copy of an existing session with a new scheduled date. Organizer only.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Session cloned',
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
    description:
      'Cancel your registration. Cannot leave within 2 hours of session start (cancellation policy).',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Successfully left session',
        example: { message: 'You have left the session' },
      },
      {
        status: 400,
        description: 'Cannot cancel within 2 hours of session start',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  confirmRegistration: {
    summary: 'Confirm registration',
    description:
      'Confirm your attendance for a session. Changes status from REGISTERED to CONFIRMED.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Registration confirmed',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  selfCheckIn: {
    summary: 'Self check-in',
    description:
      'Check yourself in to a session. Available from 15 min before to 30 min after session start.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Checked in successfully',
      },
      {
        status: 400,
        description: 'Check-in window not active',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateParticipantStatus: {
    summary: 'Update participant status',
    description:
      "Change a participant's status (ATTENDED, NO_SHOW, etc.). Organizer only. Participant is notified.",
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
