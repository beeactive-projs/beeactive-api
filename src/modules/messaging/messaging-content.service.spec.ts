import { MessagingContentService } from './messaging-content.service';

describe('MessagingContentService — Stage 5 threat detection', () => {
  const service = new MessagingContentService();

  // ─────────────────────────── empty / clean ────────────────────────

  it('empty and whitespace bodies set no flags', () => {
    for (const body of ['', '   ', '\n\t  \n']) {
      const r = service.detectThreats(body);
      expect(r.anyFlag).toBe(false);
      expect(r.urls).toEqual([]);
    }
  });

  it('plain conversational message sets no flags', () => {
    const r = service.detectThreats(
      'Running 5 minutes late — see you at the studio.',
    );
    expect(r.anyFlag).toBe(false);
  });

  // ─────────────────────────── URL extraction ───────────────────────

  it('extracts https URLs, lowercased, with trailing punctuation stripped', () => {
    const r = service.detectThreats(
      'Check out https://Example.com/page. Also https://foo.test/x!',
    );
    expect(r.urls).toEqual(
      expect.arrayContaining([
        'https://example.com/page',
        'https://foo.test/x',
      ]),
    );
    expect(r.anyFlag).toBe(true);
  });

  it('does NOT extract bare email addresses as URLs', () => {
    const r = service.detectThreats('Email me at bob@example.com.');
    expect(r.urls).toEqual([]);
    expect(r.hasShortenerUrl).toBe(false);
  });

  it('flags shortener hosts', () => {
    const r = service.detectThreats('Quick: https://bit.ly/abc123');
    expect(r.hasShortenerUrl).toBe(true);
    expect(r.anyFlag).toBe(true);
  });

  it('does not flag bit.ly look-alikes that are NOT actually shorteners', () => {
    const r = service.detectThreats('See https://example.com/bit.ly/blog');
    expect(r.hasShortenerUrl).toBe(false);
  });

  // ─────────────────────────── off-platform contacts ────────────────

  it('flags telegram.me handles', () => {
    expect(
      service.detectThreats('here is my t.me/coachjoe').hasOffPlatformContact,
    ).toBe(true);
    expect(
      service.detectThreats('here is my telegram.me/coachjoe')
        .hasOffPlatformContact,
    ).toBe(true);
  });

  it('flags wa.me / signal.me handles with numbers', () => {
    expect(
      service.detectThreats('wa.me/40712345678').hasOffPlatformContact,
    ).toBe(true);
    expect(
      service.detectThreats('signal.me/#p/+40712345678').hasOffPlatformContact,
    ).toBe(true);
  });

  it('flags "find me on Telegram" style natural phrasing', () => {
    expect(
      service.detectThreats('add me on telegram, my handle is coachjoe')
        .hasOffPlatformContact,
    ).toBe(true);
  });

  it('does NOT flag harmless mentions of those platforms', () => {
    const r = service.detectThreats(
      'I noticed Signal had a new release this week.',
    );
    expect(r.hasOffPlatformContact).toBe(false);
  });

  // ─────────────────────────── payment handles ──────────────────────

  it('flags paypal.me / revolut.me / venmo / cash.app handles', () => {
    expect(service.detectThreats('paypal.me/coachjoe').hasPaymentHandle).toBe(
      true,
    );
    expect(service.detectThreats('revolut.me/coachjoe').hasPaymentHandle).toBe(
      true,
    );
    expect(service.detectThreats('venmo.com/coachjoe').hasPaymentHandle).toBe(
      true,
    );
    expect(service.detectThreats('cash.app/$coachjoe').hasPaymentHandle).toBe(
      true,
    );
  });

  it('flags IBAN', () => {
    // Valid-shape IBAN (DE89 3704 0044 0532 0130 00) — 22 chars.
    const r = service.detectThreats('send to DE89370400440532013000 thanks');
    expect(r.hasPaymentHandle).toBe(true);
  });

  it('flags credit-card-shaped numbers that pass Luhn', () => {
    // 4111 1111 1111 1111 — canonical Visa test number, passes Luhn.
    expect(
      service.detectThreats('here: 4111 1111 1111 1111').hasPaymentHandle,
    ).toBe(true);
    expect(service.detectThreats('4111-1111-1111-1111').hasPaymentHandle).toBe(
      true,
    );
  });

  it('does NOT flag 16-digit sequences that fail Luhn (random IDs etc.)', () => {
    // 16 digits, deliberately not a valid Luhn.
    expect(
      service.detectThreats('order id 1234567890123456').hasPaymentHandle,
    ).toBe(false);
  });

  it('flags ETH-shaped addresses', () => {
    expect(
      service.detectThreats(
        'send to 0xAbCdEf1234567890aBcDeF1234567890AbCdEf12',
      ).hasPaymentHandle,
    ).toBe(true);
  });

  it('flags BTC-shaped addresses', () => {
    expect(
      service.detectThreats('btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
        .hasPaymentHandle,
    ).toBe(true);
    expect(
      service.detectThreats('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')
        .hasPaymentHandle,
    ).toBe(true);
  });

  it('does NOT leak the matched value — only returns a boolean', () => {
    const r = service.detectThreats('card 4111 1111 1111 1111');
    expect(r.hasPaymentHandle).toBe(true);
    // The result has no string field that contains the card number.
    const json = JSON.stringify(r);
    expect(json).not.toContain('4111');
  });
});
