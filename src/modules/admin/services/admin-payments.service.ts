import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op, type WhereOptions } from 'sequelize';
import type { Stripe } from 'stripe-types';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../../common/dto/pagination.dto';
import { StripeAccount } from '../../payment/entities/stripe-account.entity';
import { StripeCustomer } from '../../payment/entities/stripe-customer.entity';
import { Subscription } from '../../payment/entities/subscription.entity';
import { Invoice } from '../../payment/entities/invoice.entity';
import { Dispute } from '../../payment/entities/dispute.entity';
import {
  WebhookEvent,
  WebhookEventStatus,
} from '../../payment/entities/webhook-event.entity';
import { WebhookHandlerService } from '../../payment/services/webhook-handler.service';
import { PaymentsListDto } from '../dto/payments-list.dto';
import { AdminAuditService } from './admin-audit.service';

const USER_BRIEF = ['id', 'email', 'firstName', 'lastName'];

/**
 * Admin payments oversight (cross-tenant, read-only) + a guarded webhook
 * reprocess action. Purely additive — reuses the existing payment models
 * and WebhookHandlerService.
 */
@Injectable()
export class AdminPaymentsService {
  constructor(
    @InjectModel(StripeAccount)
    private readonly stripeAccountModel: typeof StripeAccount,
    @InjectModel(StripeCustomer)
    private readonly stripeCustomerModel: typeof StripeCustomer,
    @InjectModel(Subscription)
    private readonly subscriptionModel: typeof Subscription,
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    @InjectModel(Dispute) private readonly disputeModel: typeof Dispute,
    @InjectModel(WebhookEvent)
    private readonly webhookEventModel: typeof WebhookEvent,
    private readonly webhookHandler: WebhookHandlerService,
    private readonly audit: AdminAuditService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async listAccounts(dto: PaymentsListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    let where: WhereOptions<StripeAccount> = {};
    if (dto.filter === 'incomplete') where = { detailsSubmitted: false };
    else if (dto.filter === 'disabled') {
      where = {
        disabledReason: { [Op.ne]: null },
      } as WhereOptions<StripeAccount>;
    }
    const { rows, count } = await this.stripeAccountModel.findAndCountAll({
      where,
      include: [{ association: 'user', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async listSubscriptions(dto: PaymentsListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<Subscription> = dto.status
      ? { status: dto.status }
      : {};
    const { rows, count } = await this.subscriptionModel.findAndCountAll({
      where,
      include: [{ association: 'client', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    const items = await this.attachCustomerEmail(rows);
    return buildPaginatedResponse(items, count, page, limit);
  }

  async listInvoices(dto: PaymentsListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<Invoice> = dto.status
      ? { status: dto.status }
      : {};
    const { rows, count } = await this.invoiceModel.findAndCountAll({
      where,
      include: [{ association: 'client', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    const items = await this.attachCustomerEmail(rows);
    return buildPaginatedResponse(items, count, page, limit);
  }

  /**
   * Add `customerEmail`/`customerName` to invoice/subscription rows from
   * the linked stripe_customer — so guest billing (no registered client)
   * still shows who was billed. One batched query (no N+1): collect the
   * page's stripeCustomerIds and fetch them all at once.
   */
  private async attachCustomerEmail(
    rows: Array<Invoice | Subscription>,
  ): Promise<Record<string, unknown>[]> {
    const ids = [
      ...new Set(rows.map((r) => r.stripeCustomerId).filter(Boolean)),
    ];
    const customers = ids.length
      ? await this.stripeCustomerModel.findAll({
          where: { stripeCustomerId: { [Op.in]: ids } },
          attributes: ['stripeCustomerId', 'email', 'name'],
        })
      : [];
    const byId = new Map(customers.map((c) => [c.stripeCustomerId, c]));
    return rows.map((r) => {
      const plain = r.get({ plain: true }) as Record<string, unknown> & {
        client?: { email?: string } | null;
      };
      const cust = byId.get(r.stripeCustomerId);
      plain['customerEmail'] = plain.client?.email ?? cust?.email ?? null;
      plain['customerName'] = cust?.name ?? null;
      return plain;
    });
  }

  async listDisputes(dto: PaymentsListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<Dispute> = dto.status
      ? { status: dto.status }
      : {};
    const { rows, count } = await this.disputeModel.findAndCountAll({
      where,
      include: [{ association: 'instructor', attributes: USER_BRIEF }],
      limit,
      offset: getOffset(page, limit),
      order: [['createdAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  async listWebhooks(dto: PaymentsListDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: WhereOptions<WebhookEvent> = dto.status
      ? { status: dto.status }
      : {};
    const { rows, count } = await this.webhookEventModel.findAndCountAll({
      where,
      // payload can carry PII — never ship it in the list.
      attributes: [
        'id',
        'stripeEventId',
        'type',
        'status',
        'error',
        'receivedAt',
        'processedAt',
      ],
      limit,
      offset: getOffset(page, limit),
      order: [['receivedAt', 'DESC']],
    });
    return buildPaginatedResponse(rows, count, page, limit);
  }

  /**
   * Re-run a webhook that previously failed/orphaned. The stored payload
   * IS the verified Stripe event; processQueued is idempotent and no-ops
   * if the row is already PROCESSED.
   */
  async reprocessWebhook(adminId: string, id: string) {
    const row = await this.webhookEventModel.findByPk(id);
    if (!row) throw new NotFoundException('Webhook event not found');
    if (row.status === WebhookEventStatus.PROCESSED) {
      throw new ConflictException('Webhook already processed.');
    }
    const event = row.payload as unknown as Stripe.Event;
    await this.webhookHandler.processQueued(id, event);
    await this.audit.record({
      adminUserId: adminId,
      action: 'payments.webhook.reprocess',
      targetType: 'webhook_event',
      targetId: id,
      meta: { type: row.type },
    });
    this.logger.log(
      `Admin ${adminId} reprocessed webhook ${id} (${row.type})`,
      'AdminPaymentsService',
    );
    const updated = await this.webhookEventModel.findByPk(id, {
      attributes: ['id', 'status', 'error', 'processedAt'],
    });
    return {
      id,
      status: updated?.status ?? null,
      error: updated?.error ?? null,
    };
  }
}
