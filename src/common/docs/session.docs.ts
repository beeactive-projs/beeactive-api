import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const SessionDocs = {
  // -----------------------------------------------------------------------
  // Template endpoints (instructor, §4.1)
  // -----------------------------------------------------------------------

  createTemplate: {
    summary: 'Create a session template',
    description:
      'Creates a new session template. For non-recurring sessions (isRecurring=false), also atomically creates the single instance. ' +
      'For recurring sessions, instances are generated separately via POST /sessions/templates/:id/regenerate, ' +
      'or immediately if initialInstancesCount is provided.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'Template (and initial instances) created',
        example: {
          template: {
            id: '...',
            slug: 'morning-yoga',
            title: 'Morning Yoga',
            status: 'ACTIVE',
          },
          generatedInstances: [],
          warnings: [],
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  listTemplates: {
    summary: 'List my session templates',
    description:
      'Returns paginated list of session templates owned by the authenticated instructor. ' +
      'Filter by tab (active/recurring/ended/cancelled), type, access, locationKind, groupId, or free-text search.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Paginated template list',
        example: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  getTemplate: {
    summary: 'Get a session template by ID',
    description:
      'Returns a single session template. Returns 404 if not found or not owned by the caller.',
    auth: true,
    responses: [
      { status: 200, description: 'Template found' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  updateTemplate: {
    summary: 'Update a session template',
    description:
      'Partially updates a session template. Only provided fields are changed. ' +
      'If meetingUrl is updated, meetingProvider is re-derived automatically. ' +
      'Does not modify existing instances.',
    auth: true,
    responses: [
      { status: 200, description: 'Template updated' },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  deleteTemplate: {
    summary: 'End (delete) a session template',
    description:
      'Sets template status to ENDED and cancels all future SCHEDULED instances. Soft-deletes the template row.',
    auth: true,
    responses: [
      { status: 204, description: 'Template ended and instances cancelled' },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,

  previewRecurrence: {
    summary: 'Preview recurrence occurrences (no DB write)',
    description:
      'Pure computation endpoint. Returns ISO 8601 UTC datetimes for a recurrence rule up to the specified horizon. ' +
      'truncated=true if the horizon cap was hit before the rule naturally ended.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Occurrence datetimes computed',
        example: {
          occurrences: ['2026-07-01T06:00:00.000Z', '2026-07-08T06:00:00.000Z'],
          truncated: false,
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  } as ApiEndpointOptions,

  regenerateInstances: {
    summary: 'Generate more instances for a recurring template',
    description:
      'Generates the next N instances after the latest existing occurrence for this template. Idempotent within the rule bounds.',
    auth: true,
    responses: [
      {
        status: 201,
        description: 'New instances generated',
        example: { generatedInstances: [], warnings: [] },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
