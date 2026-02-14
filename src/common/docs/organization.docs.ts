/**
 * API Documentation for Organization endpoints
 * Centralized location for all organization-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const OrganizationDocs = {
  // ── Discovery (public) ──────────────────────────────

  discoverOrganizations: {
    summary: 'Discover public organizations',
    description:
      'Browse and search public organizations. No authentication required. ' +
      'Supports filtering by type (FITNESS, YOGA, DANCE, etc.), city, country, and free-text search. ' +
      'Results sorted by member count (most popular first).',
    auth: false,
    responses: [
      {
        status: 200,
        description: 'Organizations found',
        example: {
          data: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              name: "John's Fitness Studio",
              slug: 'johns-fitness-studio',
              description: 'Personal training and group HIIT sessions',
              type: 'FITNESS',
              joinPolicy: 'OPEN',
              city: 'Bucharest',
              country: 'RO',
              memberCount: 42,
            },
          ],
          meta: {
            page: 1,
            limit: 20,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      },
    ],
  } as ApiEndpointOptions,

  getPublicProfile: {
    summary: 'Get public organization profile',
    description:
      'Returns the public profile of an organization including trainer info, ' +
      'specializations, and upcoming sessions. No authentication required. ' +
      'Only works for public organizations.',
    auth: false,
    responses: [
      {
        status: 200,
        description: 'Public profile retrieved',
        example: {
          organization: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: "John's Fitness Studio",
            slug: 'johns-fitness-studio',
            type: 'FITNESS',
            joinPolicy: 'OPEN',
            city: 'Bucharest',
            memberCount: 42,
          },
          trainer: {
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'Coach John',
            specializations: ['hiit', 'strength'],
            yearsOfExperience: 8,
          },
          upcomingSessions: [
            {
              id: 'session-uuid',
              title: 'Morning HIIT',
              scheduledAt: '2026-02-20T08:00:00.000Z',
              durationMinutes: 45,
              maxParticipants: 12,
              price: 50,
              currency: 'RON',
            },
          ],
        },
      },
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  selfJoin: {
    summary: 'Join an organization',
    description:
      'Self-join a public organization. Only works if the organization is public and its joinPolicy is OPEN. ' +
      'For INVITE_ONLY organizations, the user needs an invitation link.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Joined successfully',
        example: { message: 'You have joined the organization' },
      },
      {
        status: 400,
        description: 'Already a member',
      },
      {
        status: 403,
        description:
          'Organization is not public or join policy requires invitation/approval',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  // ── CRUD (authenticated) ────────────────────────────

  create: {
    summary: 'Create a new organization',
    description:
      'Create a new organization. Requires ORGANIZER role. Creator becomes the owner. ' +
      'You can set type, isPublic, joinPolicy, and contact/location info.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Organization created successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: "John's Fitness Studio",
          slug: 'johns-fitness-studio',
          description: 'Personal training and group sessions',
          type: 'FITNESS',
          isPublic: true,
          joinPolicy: 'OPEN',
          timezone: 'Europe/Bucharest',
          isActive: true,
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getMyOrganizations: {
    summary: 'List my organizations',
    description: 'Returns all organizations the authenticated user belongs to.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organizations listed',
        example: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: "John's Fitness Studio",
            slug: 'johns-fitness-studio',
            type: 'FITNESS',
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  getById: {
    summary: 'Get organization by ID',
    description: 'Returns organization details. User must be a member.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization details retrieved',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  update: {
    summary: 'Update organization',
    description:
      'Update organization details. Owner only. If name changes, slug is auto-regenerated. ' +
      'You can also update type, isPublic, joinPolicy, contact info, and location.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  getMembers: {
    summary: 'List organization members (paginated)',
    description:
      'Returns paginated members list. Accepts ?page=1&limit=20 query params. If you are the owner AND a member has sharedHealthInfo=true, their health data is included.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Members listed',
        example: {
          data: [
            {
              id: 'member-uuid',
              userId: 'user-uuid',
              firstName: 'Jane',
              lastName: 'Doe',
              isOwner: false,
              sharedHealthInfo: true,
              healthData: {
                fitnessLevel: 'INTERMEDIATE',
                goals: ['weight_loss'],
              },
            },
          ],
          meta: {
            page: 1,
            limit: 20,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  updateMyMembership: {
    summary: 'Update my membership settings',
    description:
      'Update your own membership in this organization (e.g., share/hide health data, set nickname).',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Membership updated',
        example: {
          id: 'member-uuid',
          sharedHealthInfo: true,
          nickname: 'Johnny',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  leaveOrganization: {
    summary: 'Leave organization',
    description:
      'Voluntarily leave an organization. Owners cannot leave — they must delete the org or transfer ownership.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Left organization',
        example: { message: 'You have left the organization' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  removeMember: {
    summary: 'Remove a member',
    description:
      'Remove a member from the organization. Owner only. Cannot remove the owner.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Member removed',
        example: { message: 'Member removed successfully' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  deleteOrganization: {
    summary: 'Delete organization',
    description:
      'Soft-delete an organization. Owner only. All members are effectively removed.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization deleted',
        example: { message: 'Organization deleted successfully' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
