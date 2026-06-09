import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Subscription } from '../entities/subscription.entity';
import { StripeCustomer } from '../entities/stripe-customer.entity';
import { StripeAccount } from '../entities/stripe-account.entity';
import { Dispute } from '../entities/dispute.entity';
import { StripeService } from './stripe.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/notification-types';
import { PaymentRemindersService } from './payment-reminders.service';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

describe('PaymentRemindersService', () => {
  let service: PaymentRemindersService;
  const invoiceModel = { findAll: jest.fn() };
  const paymentModel = { findAll: jest.fn() };
  const subscriptionModel = { findAll: jest.fn() };
  const stripeCustomerModel = { findAll: jest.fn() };
  const stripeAccountModel = { findAll: jest.fn() };
  const disputeModel = { findAll: jest.fn() };
  const sequelize = { fn: jest.fn(), col: jest.fn() };
  const paymentMethodsRetrieve = jest.fn();
  const stripeService = {
    isConfigured: true,
    stripe: { paymentMethods: { retrieve: paymentMethodsRetrieve } },
  };
  const notify = jest.fn().mockResolvedValue({});

  beforeEach(async () => {
    jest.clearAllMocks();
    notify.mockResolvedValue({});
    const ref = await Test.createTestingModule({
      providers: [
        PaymentRemindersService,
        { provide: getModelToken(Invoice), useValue: invoiceModel },
        { provide: getModelToken(Payment), useValue: paymentModel },
        { provide: getModelToken(Subscription), useValue: subscriptionModel },
        {
          provide: getModelToken(StripeCustomer),
          useValue: stripeCustomerModel,
        },
        { provide: getModelToken(StripeAccount), useValue: stripeAccountModel },
        { provide: getModelToken(Dispute), useValue: disputeModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: StripeService, useValue: stripeService },
        { provide: NotificationService, useValue: { notify } },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = ref.get(PaymentRemindersService);
  });

  const inv = (over = {}) => ({
    id: 'inv-1',
    number: 'A-1',
    amountDueCents: 5000,
    currency: 'eur',
    dueDate: new Date('2026-07-01'),
    clientId: 'cli-1',
    instructorId: 'ins-1',
    ...over,
  });

  it('due-soon: notifies the client with a once-per-invoice fingerprint', async () => {
    invoiceModel.findAll.mockResolvedValue([inv()]);
    const r = await service.remindInvoicesDueSoon(new Date('2026-06-29'));
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cli-1',
        type: NotificationType.INVOICE_DUE_SOON,
        fingerprint: 'invoice_due_soon:inv-1',
      }),
    );
  });

  it('overdue: notifies client AND instructor with date-bucketed fingerprints', async () => {
    invoiceModel.findAll.mockResolvedValue([inv()]);
    const r = await service.escalateOverdueInvoices(
      new Date('2026-06-29T10:00:00Z'),
    );
    expect(r.sent).toBe(2);
    const fps = notify.mock.calls.map(
      (c) => (c[0] as { fingerprint: string }).fingerprint,
    );
    expect(fps).toEqual(
      expect.arrayContaining([
        'invoice_overdue:inv-1:2026-06-29',
        'invoice_overdue_instr:inv-1:2026-06-29',
      ]),
    );
  });

  it('card-expiring: notifies when the default card expires within 30 days', async () => {
    subscriptionModel.findAll.mockResolvedValue([
      { clientId: 'cli-1', stripeCustomerId: 'cus_1' },
    ]);
    stripeCustomerModel.findAll.mockResolvedValue([
      { stripeCustomerId: 'cus_1', defaultPaymentMethodId: 'pm_1' },
    ]);
    // Card expires end of the current month → within 30 days.
    const now = new Date('2026-06-10');
    paymentMethodsRetrieve.mockResolvedValue({
      card: { brand: 'visa', last4: '4242', exp_month: 6, exp_year: 2026 },
    });
    const r = await service.remindCardsExpiring(now);
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cli-1',
        type: NotificationType.CARD_EXPIRING_SOON,
      }),
    );
  });

  it('card-expiring: does NOT notify a card expiring far in the future', async () => {
    subscriptionModel.findAll.mockResolvedValue([
      { clientId: 'cli-1', stripeCustomerId: 'cus_1' },
    ]);
    stripeCustomerModel.findAll.mockResolvedValue([
      { stripeCustomerId: 'cus_1', defaultPaymentMethodId: 'pm_1' },
    ]);
    paymentMethodsRetrieve.mockResolvedValue({
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
    });
    const r = await service.remindCardsExpiring(new Date('2026-06-10'));
    expect(r.sent).toBe(0);
  });

  it('earnings: summarises the prior month per instructor+currency', async () => {
    paymentModel.findAll.mockResolvedValue([
      { instructorId: 'ins-1', currency: 'eur', gross: 12000, cnt: 3 },
    ]);
    const r = await service.sendMonthlyEarningsSummaries(
      new Date('2026-06-04'),
    );
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ins-1',
        type: NotificationType.EARNINGS_SUMMARY,
        fingerprint: 'earnings_summary:ins-1:2026-05:eur',
      }),
    );
  });

  it('refund-window: warns the instructor ~2 days before the 14-day window closes', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    // paidAt 13 days ago → window closes in ~1 day.
    const paidAt = new Date(now.getTime() - 13 * 24 * 60 * 60_000);
    paymentModel.findAll.mockResolvedValue([
      {
        id: 'pay-1',
        instructorId: 'ins-1',
        amountCents: 9000,
        currency: 'eur',
        paidAt,
      },
    ]);
    const r = await service.remindRefundWindowClosing(now);
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ins-1',
        type: NotificationType.REFUND_WINDOW_CLOSING,
        fingerprint: 'refund_window:pay-1',
      }),
    );
  });

  it('dunning: nudges the client of an OPEN invoice with a failed payment', async () => {
    paymentModel.findAll.mockResolvedValue([{ invoiceId: 'inv-1' }]);
    invoiceModel.findAll.mockResolvedValue([inv()]);
    const r = await service.runDunning(new Date('2026-06-29T00:00:00Z'));
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cli-1',
        type: NotificationType.PAYMENT_FAILED,
        fingerprint: 'dunning:inv-1:2026-06-29',
      }),
    );
  });

  it('dispute-deadline: reminds at T-3 and T-1 buckets only', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const due3 = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
    const due2 = new Date(now.getTime() + 2 * 24 * 60 * 60_000); // no reminder
    disputeModel.findAll.mockResolvedValue([
      { id: 'dp-3', instructorId: 'ins-1', evidenceDueBy: due3 },
      { id: 'dp-2', instructorId: 'ins-1', evidenceDueBy: due2 },
    ]);
    const r = await service.remindDisputeDeadlines(now);
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.DISPUTE_EVIDENCE_DUE,
        fingerprint: 'dispute_deadline:dp-3:t3',
      }),
    );
  });

  it('fan-out isolates a failing notify without aborting the sweep', async () => {
    invoiceModel.findAll.mockResolvedValue([
      inv({ id: 'inv-1' }),
      inv({ id: 'inv-2' }),
    ]);
    notify.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
    const r = await service.remindInvoicesDueSoon(new Date('2026-06-29'));
    expect(r.sent).toBe(1);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
