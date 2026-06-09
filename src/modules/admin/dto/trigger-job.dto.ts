import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Manually trigger an idempotent sweep job by registry key. */
export class TriggerJobDto {
  @ApiProperty({
    description: 'Job registry key (must be a triggerable sweep).',
    example: 'payments.reconcile_webhooks',
  })
  @IsString()
  name!: string;
}
