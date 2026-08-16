import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotificationCategory } from '../notification-categories';

/**
 * Query params for GET /notifications.
 *
 * Extends PaginationDto so `page` / `limit` come from one source of
 * truth (1..100, default 20). `unreadOnly` accepts the string forms
 * `'true'` / `'false'` because Express query strings are always
 * strings; class-transformer converts them to booleans before
 * validation runs.
 */
export class ListNotificationsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'When true, only unread + non-dismissed are returned',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  unreadOnly: boolean = false;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    description: 'Narrow to a single category. Omit for everything.',
  })
  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;
}
