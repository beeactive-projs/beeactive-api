import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { Stripe } from 'stripe-types';
import { StripeAccount } from '../entities/stripe-account.entity';
import { User } from '../../user/entities/user.entity';
import { StripeService } from './stripe.service';

/** How long a cached balance is considered fresh. The cron refreshes
 *  hourly, so 75 min leaves a margin before a load falls back to live. */
export const BALANCE_CACHE_TTL_MS = 75 * 60_000;

interface Bucket {
  amount: number;
  currency: string;
}

/**
 * Collapse a Stripe balance into the two figures the dashboard shows, in
 * the account's settlement currency. Mirrors the logic in
 * `EarningsService.getSummary` so the cached value and a live read agree:
 *   available = max(standard available, instant_available)
 *   pending   = max(0, pending − instant_available)
 * (Stripe overlaps instant_available with pending for the same money.)
 */
export function extractBalanceCents(
  balance: Stripe.Balance,
  currencyLower: string,
): { availableCents: number; pendingCents: number } {
  const sum = (buckets: Bucket[] | undefined): number =>
    (buckets ?? [])
      .filter((b) => b.currency === currencyLower)
      .reduce((s, b) => s + b.amount, 0);

  const instant = (balance as unknown as { instant_available?: Bucket[] })
    .instant_available;

  const standardAvailable = sum(balance.available as unknown as Bucket[]);
  const instantAvailable = sum(instant);
  const stripePending = sum(balance.pending as unknown as Bucket[]);

  return {
    availableCents: Math.max(standardAvailable, instantAvailable),
    pendingCents: Math.max(0, stripePending - instantAvailable),
  };
}

/**
 * Refreshes the cached Stripe balance on each connected account. Driven by
 * the hourly `payments.balance_cache_refresh` cron so `EarningsService`
 * doesn't pay a `balance.retrieve` round-trip on every dashboard load.
 */
@Injectable()
export class BalanceCacheService {
  constructor(
    @InjectModel(StripeAccount)
    private readonly stripeAccountModel: typeof StripeAccount,
    private readonly stripeService: StripeService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async refreshAll(): Promise<{ refreshed: number; failed: number }> {
    if (!this.stripeService.isConfigured) return { refreshed: 0, failed: 0 };

    const accounts = await this.stripeAccountModel.findAll({
      where: { chargesEnabled: true },
      include: [{ model: User, attributes: ['countryCode'] }],
    });

    let refreshed = 0;
    let failed = 0;
    for (const account of accounts) {
      if (!account.stripeAccountId) continue;
      try {
        const currency = this.stripeService
          .resolveCurrency({
            accountCurrency: account.defaultCurrency,
            countryCode: account.user?.countryCode,
          })
          .toLowerCase();
        const balance = await this.stripeService.stripe.balance.retrieve(
          {},
          { stripeAccount: account.stripeAccountId },
        );
        const { availableCents, pendingCents } = extractBalanceCents(
          balance,
          currency,
        );
        await account.update({
          cachedBalanceAvailableCents: availableCents,
          cachedBalancePendingCents: pendingCents,
          balanceCachedAt: new Date(),
        });
        refreshed += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn?.(
          `Balance cache refresh failed for account ${account.id}: ${(err as Error).message}`,
          'BalanceCacheService',
        );
      }
    }

    if (refreshed + failed > 0) {
      this.logger.log?.(
        `Balance cache: refreshed=${refreshed} failed=${failed}`,
        'BalanceCacheService',
      );
    }
    return { refreshed, failed };
  }
}
