import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for `GET /profile/instructors/:id/reviews`.
 *
 * `cursor` is a base64-encoded `(createdAt|id)` tuple — opaque to the
 * caller. `breakdown=1` adds a rating breakdown to the first page so
 * the client doesn't need a second round-trip.
 */
export class ListReviewsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsBooleanString()
  breakdown?: string;
}
