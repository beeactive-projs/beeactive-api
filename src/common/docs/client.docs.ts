/**
 * API Documentation for Client endpoints
 * Centralized location for all client-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const ClientDocs = {
  getMyClients: {
    summary: 'List my clients',
    description:
      'List the authenticated instructor\'s clients with pagination and optional status filter. ' +
      'Returns client info with group memberships.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Clients listed',
        example: {
          data: [
            {
              id: 'client-relationship-uuid',
              clientId: 'user-uuid',
              firstName: 'Jane',
              lastName: 'Doe',
              status: 'ACTIVE',
              startedAt: '2026-01-15T10:00:00.000Z',
              notes: 'Working on weight loss goals',
            },
          ],
          meta: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getMyInstructors: {
    summary: 'List my instructors',
    description: 'List all instructors the authenticated user is a client of.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Instructors listed',
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  getPendingRequests: {
    summary: 'List pending requests',
    description: 'List pending incoming client requests for the authenticated user.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Pending requests listed',
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  sendInvitation: {
    summary: 'Send client invitation',
    description:
      'Instructor sends an invitation to a user to become their client. Creates a pending relationship.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Client invitation sent',
        example: {
          message: 'Client invitation sent successfully',
          request: { id: 'request-uuid', status: 'PENDING' },
        },
      },
      { status: 400, description: 'Relationship already exists or pending request' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  requestToBeClient: {
    summary: 'Request to become a client',
    description:
      'User requests to become a client of the specified instructor. Instructor must be accepting clients.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Client request sent',
        example: {
          message: 'Request sent successfully',
          request: { id: 'request-uuid', status: 'PENDING' },
        },
      },
      { status: 400, description: 'Instructor not accepting clients or relationship exists' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  acceptRequest: {
    summary: 'Accept client request',
    description: 'Accept a pending client request. Creates/activates the instructor-client relationship.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Request accepted',
        example: { message: 'Request accepted successfully' },
      },
      { status: 400, description: 'Request already responded to or expired' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  declineRequest: {
    summary: 'Decline client request',
    description: 'Decline a pending client request.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Request declined',
        example: { message: 'Request declined' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  cancelRequest: {
    summary: 'Cancel client request',
    description: 'Cancel a client request that the authenticated user sent.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Request cancelled',
        example: { message: 'Request cancelled' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateClient: {
    summary: 'Update client relationship',
    description: 'Update notes or status for a client relationship. Instructor only.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Client updated',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  archiveClient: {
    summary: 'Archive client relationship',
    description: 'Archive (soft-remove) a client relationship. Instructor only.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Client archived',
        example: { message: 'Client relationship archived' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
