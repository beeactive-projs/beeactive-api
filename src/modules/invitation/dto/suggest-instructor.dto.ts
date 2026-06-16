import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SuggestInstructorDto {
  @IsString()
  @MinLength(2, { message: 'Coach name must be at least 2 characters.' })
  @MaxLength(120)
  coachName!: string;

  @IsEmail({}, { message: 'A valid email is required.' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Note must be 500 characters or fewer.' })
  note?: string;
}
