/**
 * API Documentation for Organization endpoints
 * Centralized location for all organization-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const OrganizationDocs = {
  create: {
    summary: 'Create a new organization',
    description:
      'Create a new organization. Requires ORGANIZER role. Creator becomes the owner.',
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
    description: 'Update organization details. Owner only.',
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
