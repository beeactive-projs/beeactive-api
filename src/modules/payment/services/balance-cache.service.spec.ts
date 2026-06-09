import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StripeAccount } from '../entities/stripe-account.entity';
import { StripeService } from './stripe.service';
import {
  BalanceCacheService,
  extractBalanceCents,
} from './balance-cache.service';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

describe('extractBalanceCents', () => {
  it('available = max(standard, instant); pending = max(0, pending - instant)', () => {
    const balance = {
      available: [{ amount: 1000, currency: 'eur' }],
      instant_available: [{ amount: 2500, currency: 'eur' }],
      pending: [{ amount: 4000, currency: 'eur' }],
    } as never;
    expect(extractBalanceCents(balance, 'eur')).toEqual({
      availableCents: 2500,
      pendingCents: 1500,
    });
  });

  it('ignores buckets in other currencies', () => {
    const balance = {
      available: [
        { amount: 1000, currency: 'eur' },
        { amount: 9999, currency: 'usd' },
      ],
      pending: [{ amount: 500, currency: 'eur' }],
    } as never;
    expect(extractBalanceCents(balance, 'eur')).toEqual({
      availableCents: 1000,
      pendingCents: 500,
    });
  });
});

describe('BalanceCacheService.refreshAll', () => {
  let service: BalanceCacheService;
  const stripeAccountModel = { findAll: jest.fn() };
  const balanceRetrieve = jest.fn();
  const stripeService = {
    isConfigured: true,
    stripe: { balance: { retrieve: balanceRetrieve } },
    resolveCurrency: jest.fn().mockReturnValue('eur'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    stripeService.resolveCurrency.mockReturnValue('eur');
    const ref = await Test.createTestingModule({
      providers: [
        BalanceCacheService,
        { provide: getModelToken(StripeAccount), useValue: stripeAccountModel },
        { provide: StripeService, useValue: stripeService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = ref.get(BalanceCacheService);
  });

  it('writes cached balance columns per connected account', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    stripeAccountModel.findAll.mockResolvedValue([
      {
        id: 'acc-1',
        stripeAccountId: 'acct_1',
        defaultCurrency: 'eur',
        user: { countryCode: 'RO' },
        update,
      },
    ]);
    balanceRetrieve.mockResolvedValue({
      available: [{ amount: 3000, currency: 'eur' }],
      pending: [{ amount: 1000, currency: 'eur' }],
    });

    const r = await service.refreshAll();

    expect(r).toEqual({ refreshed: 1, failed: 0 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        cachedBalanceAvailableCents: 3000,
        cachedBalancePendingCents: 1000,
        balanceCachedAt: expect.any(Date),
      }),
    );
  });

  it('isolates a failing account (counts it failed, keeps going)', async () => {
    stripeAccountModel.findAll.mockResolvedValue([
      {
        id: 'acc-1',
        stripeAccountId: 'acct_1',
        defaultCurrency: 'eur',
        user: null,
        update: jest.fn(),
      },
    ]);
    balanceRetrieve.mockRejectedValue(new Error('stripe down'));
    const r = await service.refreshAll();
    expect(r).toEqual({ refreshed: 0, failed: 1 });
  });
});
