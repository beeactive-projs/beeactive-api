import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Messages-within-conversation list query.
 *
 * Cursor pagination by `before` (a message id). Server returns the
 * `limit` newest messages older than `before`, sorted DESC. First page
 * call omits `before`. Page-by-page pagination is intentionally NOT
 * supported — message threads use cursor for stable infinite scroll.
 */
export class ListMessagesDto {
  @ApiPropertyOptional({
    description:
      'Return messages strictly older than this message id (cursor). Omit to fetch the newest page.',
    example: '8b2a6f8b-9f93-4d11-9a4b-9c0a3a6c1b2e',
  })
  @IsOptional()
  @IsUUID('4')
  before?: string;

  @ApiPropertyOptional({
    description: 'Page size, max 100',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
