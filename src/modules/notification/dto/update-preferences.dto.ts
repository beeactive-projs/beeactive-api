import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { NotificationType } from '../notification-types';

/**
 * One channel toggle entry. All keys optional — omitting a key falls
 * back to the system default for that channel.
 */
export class ChannelPreferencesDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  in_app?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}

/**
 * One row in the bulk-update payload.
 */
export class PreferenceUpdateItemDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ type: ChannelPreferencesDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelPreferencesDto)
  channels: ChannelPreferencesDto;
}

/**
 * Body for PATCH /users/me/notification-settings.
 *
 * Whole-payload save — the FE sends one entry per notification type
 * the user has changed. Items it doesn't include keep their previous
 * value (we never wipe; we only upsert).
 */
export class UpdatePreferencesDto {
  @ApiProperty({ type: [PreferenceUpdateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PreferenceUpdateItemDto)
  items: PreferenceUpdateItemDto[];
}
