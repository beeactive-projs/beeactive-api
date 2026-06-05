import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request';
import { AdminPaymentsService } from '../services/admin-payments.service';
import { PaymentsListDto } from '../dto/payments-list.dto';

/** Operations — payments oversight. Read ADMIN+; reprocess SUPER_ADMIN. */
@ApiTags('Admin — Payments')
@Controller('admin/payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get('accounts')
  @ApiEndpoint(AdminDocs.listAccounts)
  accounts(@Query() q: PaymentsListDto) {
    return this.payments.listAccounts(q);
  }

  @Get('subscriptions')
  @ApiEndpoint(AdminDocs.listSubscriptions)
  subscriptions(@Query() q: PaymentsListDto) {
    return this.payments.listSubscriptions(q);
  }

  @Get('invoices')
  @ApiEndpoint(AdminDocs.listInvoices)
  invoices(@Query() q: PaymentsListDto) {
    return this.payments.listInvoices(q);
  }

  @Get('disputes')
  @ApiEndpoint(AdminDocs.listDisputes)
  disputes(@Query() q: PaymentsListDto) {
    return this.payments.listDisputes(q);
  }

  @Get('webhooks')
  @ApiEndpoint(AdminDocs.listWebhooks)
  webhooks(@Query() q: PaymentsListDto) {
    return this.payments.listWebhooks(q);
  }

  @Post('webhooks/:id/reprocess')
  @Roles('SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.reprocessWebhook)
  reprocess(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.reprocessWebhook(req.user.id, id);
  }
}
