import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for `PATCH /profile/handle`. Server normalises to lowercase and
 * enforces a strict slug-like character set so handles are easy to type
 * and never collide with future routing patterns (`/@-foo`, `/@foo/`).
 *
 * The regex disallows leading/trailing punctuation and runs of length
 * 3..40 — matches the column width in migration 040.
 */
export class UpdateHandleDto {
  @ApiProperty({ example: 'jane-doe', minLength: 3, maxLength: 40 })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Length(3, 40)
  @Matches(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, {
    message:
      'handle must be 3-40 chars of lowercase letters, digits, "_" or "-", ' +
      'starting and ending alphanumeric',
  })
  handle!: string;
}
