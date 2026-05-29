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

/**
 * Render a session start time for notification bodies. Includes the
 * weekday and time so the recipient can recognise it at a glance.
 *
 *   formatSessionTime(new Date('2026-06-15T18:00Z'), 'Europe/Bucharest')
 *     → 'Mon 15 Jun, 21:00'
 *
 * `timezone` is the session's IANA zone — the recipient's actual local
 * zone is not knowable here, but using the session's zone (the one the
 * instructor scheduled in) is the convention the design canvas follows.
 */
export function formatSessionTime(
  date: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}
