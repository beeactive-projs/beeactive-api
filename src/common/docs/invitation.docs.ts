/**
 * API Documentation for Invitation endpoints
 * Centralized location for all invitation-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const InvitationDocs = {
  create: {
    summary: 'Send an invitation',
    description:
      'Invite someone to join your organization. Returns an invitationLink for testing (no email sent).',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Invitation sent',
        example: {
          invitation: {
            id: 'invitation-uuid',
            email: 'mike@trainer.com',
            organizationId: 'org-uuid',
            expiresAt: '2026-02-22T00:00:00.000Z',
          },
          invitationLink:
            'http://localhost:4200/accept-invitation?token=abc123...',
        },
      },
      { status: 400, description: 'Active invitation already exists' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getMyPendingInvitations: {
    summary: 'Get my pending invitations',
    description:
      "Returns all pending invitations for the authenticated user's email.",
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Pending invitations listed',
        example: [
          {
            id: 'invitation-uuid',
            inviter: { firstName: 'Sarah', lastName: 'Johnson' },
            organization: { name: "Sarah's Fitness Studio" },
            role: { displayName: 'Participant' },
            message: 'Join my fitness studio!',
            expiresAt: '2026-02-22T00:00:00.000Z',
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  accept: {
    summary: 'Accept an invitation',
    description:
      'Accept an invitation using its token. Adds you to the organization and assigns the role.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Invitation accepted',
        example: {
          message: 'Invitation accepted successfully',
          organizationId: 'org-uuid',
        },
      },
      {
        status: 400,
        description: 'Invitation expired, already accepted, or declined',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  decline: {
    summary: 'Decline an invitation',
    description: 'Decline an invitation using its token.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Invitation declined',
        example: { message: 'Invitation declined' },
      },
      { status: 400, description: 'Invitation already responded to' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  getOrganizationInvitations: {
    summary: 'List organization invitations',
    description:
      'List all invitations sent for an organization. Requires org membership.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization invitations listed',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,
};
