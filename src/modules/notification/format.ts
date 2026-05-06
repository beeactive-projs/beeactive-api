/**
 * Tiny shared formatters for notification body strings.
 *
 * Kept minimal on purpose — these run inside producers (services) that
 * format thousands of notifications a day. Anything heavier (Intl
 * locale negotiation, plurals, full i18n) belongs in a dedicated layer
 * once we actually have non-English templates to render.
 */

/**
 * Render a cent amount as a currency-tagged string. Currency arrives
 * either lowercase (Stripe convention) or uppercase (our DB) — we
 * uppercase for display either way.
 *
 *   formatMoney(1234, 'eur') → '12.34 EUR'
 *   formatMoney(1000, 'RON') → '10.00 RON'
 */
export function formatMoney(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/**
 * Format a date for an English-speaking audience as `DD MMM YYYY`.
 * Returns `null` for null input so callers can safely use it inside
 * conditional sentence assembly.
 *
 *   formatDueDate(new Date('2026-12-31')) → '31 Dec 2026'
 *   formatDueDate(null) → null
 */
export function formatDueDate(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
