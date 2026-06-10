import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendFriendInviteDto {
  @IsEmail({}, { message: 'A valid email is required.' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Personal message must be 500 characters or fewer.',
  })
  personalMessage?: string;
}
