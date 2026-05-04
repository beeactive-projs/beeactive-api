import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DevicePlatform } from '../entities/device-token.entity';

/**
 * The two keys returned alongside a Web Push subscription. Validated
 * as a nested DTO so a malicious client can't sneak `null` / arrays
 * past `@IsObject()` and crash the worker that hashes them later.
 */
export class WebPushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  auth: string;
}

/**
 * Web Push subscription shape — what the browser hands back after
 * `pushManager.subscribe()`. We accept either this shape (for WEB)
 * or a plain string (for IOS/ANDROID FCM tokens).
 */
export class WebPushSubscriptionDto {
  @ApiProperty({
    description: 'PushSubscription.endpoint URL (Web Push only)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint: string;

  @ApiProperty({
    type: WebPushKeysDto,
    description: 'PushSubscription.keys (p256dh + auth, Web Push only)',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys: WebPushKeysDto;
}

/**
 * Body for POST /devices/register.
 *
 * For platform=WEB the FE sends the full subscription object.
 * For IOS / ANDROID it sends the FCM token as `tokenString`.
 *
 * Exactly one of `subscription` or `tokenString` must be present —
 * enforced by the @ValidateIf checks below so 400s explain which
 * field was missing.
 */
export class RegisterDeviceDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiPropertyOptional({
    type: WebPushSubscriptionDto,
    description: 'Required when platform=WEB',
  })
  @ValidateIf((o: RegisterDeviceDto) => o.platform === DevicePlatform.WEB)
  @IsObject()
  @ValidateNested()
  @Type(() => WebPushSubscriptionDto)
  subscription?: WebPushSubscriptionDto;

  @ApiPropertyOptional({
    description: 'FCM token. Required when platform=IOS or ANDROID.',
  })
  @ValidateIf((o: RegisterDeviceDto) => o.platform !== DevicePlatform.WEB)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  tokenString?: string;

  @ApiPropertyOptional({ description: 'Optional friendly device label' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  deviceLabel?: string;
}
