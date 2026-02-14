/**
 * API Documentation for Auth endpoints
 * Centralized location for all auth-related Swagger documentation
 */

import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const AuthDocs = {
  register: {
    summary: 'Register a new user',
    description:
      'Create a new user account with email and password. Automatically assigns PARTICIPANT role.',
    responses: [
      {
        status: 201,
        description: 'User successfully registered',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            firstName: 'John',
            lastName: 'Doe',
            roles: ['PARTICIPANT'],
          },
        },
      },
      ApiStandardResponses.BadRequest,
      { status: 409, description: 'User with this email already exists' },
      ApiStandardResponses.TooManyRequests,
    ],
  } as ApiEndpointOptions,

  login: {
    summary: 'Login user',
    description:
      'Authenticate user with email and password. Returns JWT access and refresh tokens.',
    responses: [
      {
        status: 200,
        description: 'Successfully authenticated',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'user@example.com',
            firstName: 'John',
            lastName: 'Doe',
            roles: ['PARTICIPANT', 'ORGANIZER'],
          },
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.TooManyRequests,
    ],
  } as ApiEndpointOptions,

  refreshToken: {
    summary: 'Refresh access token',
    description:
      'Generate new access token using refresh token. Refresh token must be valid and not expired.',
    responses: [
      {
        status: 200,
        description: 'New access token generated',
        example: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.BadRequest,
    ],
  } as ApiEndpointOptions,

  forgotPassword: {
    summary: 'Request password reset',
    description:
      'Send password reset email to user. Always returns success to prevent email enumeration.',
    responses: [
      {
        status: 200,
        description: 'If email exists, reset link sent',
        example: {
          message: 'If email exists, reset link sent',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.TooManyRequests,
    ],
  } as ApiEndpointOptions,

  resetPassword: {
    summary: 'Reset password',
    description:
      'Reset user password using valid reset token. Token is single-use and expires after 1 hour.',
    responses: [
      {
        status: 200,
        description: 'Password successfully reset',
        example: {
          message: 'Password successfully reset',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
    ],
  } as ApiEndpointOptions,

  verifyEmail: {
    summary: 'Verify email address',
    description:
      'Verify user email using the token sent during registration. Token is single-use and expires after 24 hours.',
    responses: [
      {
        status: 200,
        description: 'Email verified successfully',
        example: {
          message:
            'Email verified successfully. You can now use all features.',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.TooManyRequests,
    ],
  } as ApiEndpointOptions,

  resendVerification: {
    summary: 'Resend verification email',
    description:
      'Resend the email verification link. Always returns success to prevent email enumeration.',
    responses: [
      {
        status: 200,
        description: 'If email exists and is not verified, a new link is sent',
        example: {
          message:
            'If your email is registered and not yet verified, a new verification link has been sent.',
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.TooManyRequests,
    ],
  } as ApiEndpointOptions,

  // TODO: Implement these endpoints
  // - logout: Invalidate refresh token (refresh_token table already exists)
};
