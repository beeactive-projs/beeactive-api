import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `POST /sessions/instances/:id/follow-up`.
 *
 * Instructor blasts a message to participants after the session is over.
 *
 * `audience`:
 *   - `all`       — every non-terminal participant of this instance
 *   - `attended`  — only participants marked `attended=true`
 *   - `noshow`    — only participants marked `attended=false`
 *   - `userIds`   — explicit allowlist; `userIds` must be set
 *
 * `message` is the body shown to the recipient (HTML stripped server-side).
 */
export class FollowUpDto {
  @ApiProperty({ enum: ['all', 'attended', 'noshow', 'userIds'] })
  @IsIn(['all', 'attended', 'noshow', 'userIds'])
  audience: 'all' | 'attended' | 'noshow' | 'userIds';

  @ApiPropertyOptional({
    description: 'Required when audience=userIds. Max 200 ids.',
    type: [String],
  })
  @ValidateIf((o: FollowUpDto) => o.audience === 'userIds')
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  @IsOptional()
  userIds?: string[];

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
