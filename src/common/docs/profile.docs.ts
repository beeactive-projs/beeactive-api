/**
 * API Documentation for Profile endpoints
 * Centralized location for all profile-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const ProfileDocs = {
  getProfileOverview: {
    summary: 'Get full profile overview',
    description:
      'Returns user data, roles, and both profiles. Use this on app load to determine what UI to show.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Profile overview retrieved',
        example: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          roles: ['PARTICIPANT'],
          hasOrganizerProfile: false,
          participantProfile: {
            fitnessLevel: 'INTERMEDIATE',
            goals: ['weight_loss'],
          },
          organizerProfile: null,
        },
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  getParticipantProfile: {
    summary: 'Get participant profile',
    description: "Returns the authenticated user's participant profile data.",
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Participant profile retrieved',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          fitnessLevel: 'INTERMEDIATE',
          goals: ['weight_loss', 'muscle_gain'],
          dateOfBirth: '1990-05-15',
          gender: 'MALE',
          heightCm: 180.5,
          weightKg: 75.0,
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateParticipantProfile: {
    summary: 'Update participant profile',
    description:
      'Update health & fitness data. All fields are optional — fill them progressively.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Participant profile updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  getOrganizerProfile: {
    summary: 'Get organizer profile',
    description: "Returns the authenticated user's organizer/trainer profile.",
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organizer profile retrieved',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Coach John',
          bio: 'Certified trainer',
          specializations: ['hiit', 'yoga'],
          yearsOfExperience: 5,
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateOrganizerProfile: {
    summary: 'Update organizer profile',
    description:
      'Update professional data. All fields optional — fill progressively.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organizer profile updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateFullProfile: {
    summary: 'Update full profile (unified)',
    description:
      'Update user + participant + organizer profiles in a single API call. Only provided sections are updated. Pass { user: {...}, participant: {...}, organizer: {...} }.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Profile sections updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  createOrganizerProfile: {
    summary: 'Activate organizer profile',
    description:
      'Creates an organizer profile and assigns the ORGANIZER role. This is the "I want to organize activities" action.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Organizer profile created and ORGANIZER role assigned',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Coach John',
          userId: '550e8400-e29b-41d4-a716-446655440001',
        },
      },
      { status: 409, description: 'Organizer profile already exists' },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,
};
