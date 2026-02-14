import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateUserDto } from '../../user/dto/update-user.dto';
import { UpdateParticipantProfileDto } from './update-participant-profile.dto';
import { UpdateOrganizerProfileDto } from './update-organizer-profile.dto';

/**
 * Update Full Profile DTO
 *
 * Unified DTO for updating user + participant + organizer profiles in one call.
 * All sections are optional — only provided sections are updated.
 */
export class UpdateFullProfileDto {
  @ApiPropertyOptional({
    description: 'Core user fields (name, phone, avatar, etc.)',
    type: UpdateUserDto,
  })
  @ValidateNested()
  @Type(() => UpdateUserDto)
  @IsOptional()
  user?: UpdateUserDto;

  @ApiPropertyOptional({
    description: 'Participant profile fields (health, fitness data)',
    type: UpdateParticipantProfileDto,
  })
  @ValidateNested()
  @Type(() => UpdateParticipantProfileDto)
  @IsOptional()
  participant?: UpdateParticipantProfileDto;

  @ApiPropertyOptional({
    description: 'Organizer profile fields (bio, specializations, etc.)',
    type: UpdateOrganizerProfileDto,
  })
  @ValidateNested()
  @Type(() => UpdateOrganizerProfileDto)
  @IsOptional()
  organizer?: UpdateOrganizerProfileDto;
}
