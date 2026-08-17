import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Query for `GET /payments/payments`.
 *
 * `invoiceId` is how a caller gets from an invoice to the payment that
 * settled it — a refund is issued against a payment, and the invoice has no
 * pointer to one.
 */
export class ListPaymentsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Only payments that settled this invoice.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  invoiceId?: string;
}
