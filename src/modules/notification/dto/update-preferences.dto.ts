import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { NotificationCategory } from '../notification-categories';

/**
 * Configurable channels we expose on the settings UI.
 *
 * In-app is always-on by design (the bell is the user's inbox); push
 * and SMS aren't implemented yet. We keep the payload to one channel
 * so we don't over-promise. When push ships we'll add `push: boolean`
 * here and the controller will accept it without further changes.
 */
export class ConfigurableChannelPreferencesDto {
  @ApiProperty({ description: 'Send email for events in this category' })
  @IsBoolean()
  email: boolean;
}

/**
 * One category row in the bulk-update payload.
 */
export class CategoryPreferenceUpdateDto {
  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiProperty({ type: ConfigurableChannelPreferencesDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ConfigurableChannelPreferencesDto)
  channels: ConfigurableChannelPreferencesDto;
}

/**
 * Body for PATCH /users/me/notification-settings.
 *
 * Whole-payload save — the FE sends one entry per category the user
 * changed. Categories not in the payload keep their previous value
 * (we never wipe; we only upsert behind the scenes).
 *
 * Capped at the number of categories (~6) — no danger of giant
 * payloads.
 */
export class UpdatePreferencesDto {
  @ApiProperty({ type: [CategoryPreferenceUpdateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CategoryPreferenceUpdateDto)
  items: CategoryPreferenceUpdateDto[];
}
