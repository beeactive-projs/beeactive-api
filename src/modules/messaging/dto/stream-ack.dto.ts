import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class StreamAckDto {
  @ApiProperty({
    description:
      'The id of the most recently processed SSE event. Echoed verbatim by the FE.',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  lastEventId!: string;
}
