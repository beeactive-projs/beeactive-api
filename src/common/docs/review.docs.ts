import { ApiEndpointOptions } from '../decorators/api-response.decorator';
import { ApiStandardResponses } from './standard-responses';

export const ReviewDocs = {
  listForInstructor: {
    summary: "List an instructor's public reviews",
    description:
      'Returns paginated reviews newest-first. Pass `?cursor=...` for the next page (cursor from the previous response). ' +
      'Pass `?breakdown=true` on the first page to also get the rating breakdown — saves a second round-trip. ' +
      'Reviews are public; no authentication required.',
    auth: false,
    responses: [
      {
        status: 200,
        description:
          'Paginated reviews (with optional breakdown on first page).',
        example: {
          items: [
            {
              id: 'review-uuid',
              rating: 5,
              body: 'Great instructor. Real, lasting results.',
              monthsIn: 3,
              createdAt: '2026-05-01T10:00:00.000Z',
              author: {
                id: 'user-uuid',
                name: 'Maria Popescu',
                initials: 'MP',
                avatarId: 1,
                avatarUrl: null,
              },
            },
          ],
          nextCursor: 'eyJjcmVhdGVkQXQ...',
          breakdown: {
            average: 4.9,
            total: 86,
            distribution: [
              { star: 5, count: 78, percent: 91 },
              { star: 4, count: 6, percent: 7 },
              { star: 3, count: 1, percent: 1 },
              { star: 2, count: 1, percent: 1 },
              { star: 1, count: 0, percent: 0 },
            ],
          },
        },
      },
      ApiStandardResponses.NotFound,
    ],
  } as ApiEndpointOptions,
};
