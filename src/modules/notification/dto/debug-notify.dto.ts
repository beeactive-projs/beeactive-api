import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NotificationSeverity } from '../entities/notification.entity';
import { NotificationType } from '../notification-types';

/**
 * Routing payload — structurally compatible with `NotificationData`
 * but declared separately so class-validator can enforce string
 * lengths on the deep-link target. The service accepts any object
 * shape, so we don't need `implements NotificationData` (which would
 * force us to add the same `[key: string]: unknown` index signature).
 */
export class DebugNotifyDataDto {
  @ApiProperty({ description: 'FE route segment (e.g. "session", "invoice")' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  screen: string;

  @ApiPropertyOptional({ description: 'Entity ID appended to the deep link' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ description: 'Optional action verb hint for the FE' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  action?: string;
}

/**
 * Body for POST /admin/debug/notify.
 *
 * SUPER_ADMIN-only escape hatch to fire NotificationService.notify()
 * without an upstream producer. Used to smoke-test the notification
 * pipeline end-to-end (in-app row + email + receipt audit) before we
 * migrate real producers to the new system.
 */
export class DebugNotifyDto {
  @ApiProperty({ description: 'Recipient user ID' })
  @IsUUID('4')
  userId: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ type: DebugNotifyDataDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => DebugNotifyDataDto)
  data?: DebugNotifyDataDto;

  @ApiPropertyOptional({ enum: NotificationSeverity })
  @IsEnum(NotificationSeverity)
  @IsOptional()
  severity?: NotificationSeverity;

  @ApiPropertyOptional({
    description:
      'Optional fingerprint for dedup testing. Same value across calls = no second alert.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  fingerprint?: string;

  @ApiPropertyOptional({ description: 'Optional CTA label for the email' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  ctaLabel?: string;
}
