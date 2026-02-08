import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

/**
 * Swagger Decorator Helpers
 *
 * These are "meta-decorators" that combine multiple Swagger decorators.
 * Benefits:
 * - Keep controllers clean and readable
 * - Ensure consistent documentation across endpoints
 * - Easy to update documentation in one place
 *
 * Think of decorators as "annotations" that add metadata to your code.
 * They don't change behavior, just add information for Swagger docs.
 */

interface ApiEndpointOptions {
  summary: string;
  description?: string;
  auth?: boolean;
  body?: Type<any>;
  responses?: {
    status: number;
    description: string;
    example?: any;
  }[];
}

/**
 * Unified API Endpoint Decorator
 *
 * Usage:
 * @ApiEndpoint({
 *   summary: 'Get user profile',
 *   auth: true,
 *   responses: [...]
 * })
 */
export function ApiEndpoint(options: ApiEndpointOptions) {
  const decorators = [
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
  ];

  // Add auth decorator if endpoint requires authentication
  if (options.auth) {
    decorators.push(ApiBearerAuth('JWT-auth'));
  }

  // Add request body documentation if provided
  if (options.body) {
    decorators.push(ApiBody({ type: options.body }));
  }

  // Add response documentation
  if (options.responses) {
    options.responses.forEach((response) => {
      decorators.push(
        ApiResponse({
          status: response.status,
          description: response.description,
          ...(response.example && {
            schema: { example: response.example },
          }),
        }),
      );
    });
  }

  return applyDecorators(...decorators);
}

/**
 * Standard Error Responses
 * Use these for common error responses to keep docs consistent
 */
export const ApiStandardResponses = {
  Unauthorized: {
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  },
  Forbidden: {
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  },
  NotFound: {
    status: 404,
    description: 'Resource not found',
  },
  BadRequest: {
    status: 400,
    description: 'Bad Request - Invalid input data',
  },
  TooManyRequests: {
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
  },
  InternalServerError: {
    status: 500,
    description: 'Internal Server Error',
  },
};
