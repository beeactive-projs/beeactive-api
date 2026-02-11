/**
 * API Documentation for User endpoints
 * Centralized location for all user-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const UserDocs = {
  getProfile: {
    summary: 'Get current user profile',
    description:
      'Returns the profile of the currently authenticated user. Requires valid JWT token.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'User profile retrieved successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'user@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+40123456789',
          is_active: true,
          is_email_verified: false,
          created_at: '2024-01-15T10:30:00.000Z',
        },
      },
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,
};
