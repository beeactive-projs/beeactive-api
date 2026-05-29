import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions, fn, col } from 'sequelize';
import { Review } from './entities/review.entity';
import { User, USER_SAFE_ATTRIBUTES } from '../user/entities/user.entity';
import {
  PaginatedReviewsDto,
  ReviewBreakdownDto,
  ReviewBreakdownDistributionDto,
  ReviewDto,
  ReviewSummary,
} from './dto/review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

/**
 * Reads public reviews for an instructor profile. Write/report flows
 * are deliberately not implemented yet — see plan §"Out of scope".
 */
@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review) private readonly reviewModel: typeof Review,
  ) {}

  /**
   * Aggregate rating average + total for an instructor profile. Used
   * by `ProfileService` to enrich the public profile DTO so a single
   * profile fetch can render the stat strip without a second round-
   * trip. Returns `{ average: 0, total: 0 }` when there are no
   * reviews — callers can null-check via `total === 0`.
   */
  async getSummaryForProfile(profileId: string): Promise<ReviewSummary> {
    const row = (await this.reviewModel.findOne({
      where: { instructorProfileId: profileId },
      attributes: [
        [fn('AVG', col('rating')), 'avg'],
        [fn('COUNT', col('id')), 'count'],
      ],
      raw: true,
    })) as unknown as { avg: string | null; count: string | null } | null;

    const avg = row?.avg ? Number(row.avg) : 0;
    const count = row?.count ? Number(row.count) : 0;
    return {
      average: count === 0 ? 0 : Math.round(avg * 10) / 10,
      total: count,
    };
  }

  /**
   * Per-star breakdown for the rating bars on the Reviews tab. Always
   * returns exactly 5 buckets, even when the count is zero, so the UI
   * doesn't have to fill blanks.
   */
  async getBreakdown(profileId: string): Promise<ReviewBreakdownDto> {
    const rows = (await this.reviewModel.findAll({
      where: { instructorProfileId: profileId },
      attributes: ['rating', [fn('COUNT', col('id')), 'count']],
      group: ['rating'],
      raw: true,
    })) as unknown as { rating: number; count: string }[];

    const countsByStar = new Map<number, number>();
    let total = 0;
    let weightedSum = 0;
    for (const r of rows) {
      const n = Number(r.count);
      countsByStar.set(r.rating, n);
      total += n;
      weightedSum += n * r.rating;
    }

    const distribution: ReviewBreakdownDistributionDto[] = [5, 4, 3, 2, 1].map(
      (star) => {
        const count = countsByStar.get(star) ?? 0;
        const percent = total === 0 ? 0 : Math.round((count / total) * 100);
        return { star: star as 1 | 2 | 3 | 4 | 5, count, percent };
      },
    );

    return {
      average: total === 0 ? 0 : Math.round((weightedSum / total) * 10) / 10,
      total,
      distribution,
    };
  }

  /**
   * Cursor-paginated list of reviews newest-first. Cursor encodes the
   * boundary `(createdAt, id)` as base64 so callers don't need to
   * understand the shape. When `breakdown=true` the first-page
   * response carries a breakdown so the client renders the rating
   * bars without a second round-trip.
   */
  async listForInstructor(
    profileId: string,
    dto: ListReviewsDto,
  ): Promise<PaginatedReviewsDto> {
    const limit = dto.limit ?? 10;

    const where: WhereOptions<Review> = {
      instructorProfileId: profileId,
    };
    if (dto.rating != null) {
      (where as Record<string, unknown>).rating = dto.rating;
    }

    if (dto.cursor) {
      const parsed = decodeCursor(dto.cursor);
      if (parsed) {
        // Newest-first: keep rows strictly older than the cursor, or
        // same instant but with a smaller id.
        (where as Record<string, unknown>)[Op.and as unknown as string] = [
          {
            [Op.or]: [
              { createdAt: { [Op.lt]: parsed.createdAt } },
              {
                createdAt: parsed.createdAt,
                id: { [Op.lt]: parsed.id },
              },
            ],
          },
        ];
      }
    }

    const rows = await this.reviewModel.findAll({
      where,
      include: [
        {
          model: User,
          as: 'author',
          required: false,
          attributes: USER_SAFE_ATTRIBUTES,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;

    const items: ReviewDto[] = trimmed.map((r) => toReviewDto(r));

    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    const includeBreakdown = !dto.cursor && dto.breakdown === 'true';

    return {
      items,
      nextCursor,
      ...(includeBreakdown
        ? { breakdown: await this.getBreakdown(profileId) }
        : {}),
    };
  }
}

function toReviewDto(r: Review): ReviewDto {
  const author = r.author;
  const firstName = author?.firstName ?? '';
  const lastName = author?.lastName ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Anonymous';
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'A';
  return {
    id: r.id,
    rating: r.rating,
    body: r.body,
    monthsIn: r.monthsIn ?? null,
    createdAt: r.createdAt.toISOString(),
    author: {
      id: author?.id ?? null,
      name,
      initials,
      avatarId: author?.avatarId ?? null,
      avatarUrl: author?.avatarUrl ?? null,
    },
  };
}

interface CursorPayload {
  createdAt: Date;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
    'base64',
  );
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const [iso, id] = raw.split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
