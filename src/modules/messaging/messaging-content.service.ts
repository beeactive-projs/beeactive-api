import { Injectable } from '@nestjs/common';

/**
 * Result of a content scan on an outgoing message body. Pure data;
 * MessagingService attaches it to the response so the FE can surface
 * warning banners ("this looks like a payment request, are you sure?").
 *
 * NOTE: none of these flags BLOCK a send. They inform the user and
 * leave a trail in `message.metadata.threatFlags` so admins can review
 * patterns later. Blocking would be hostile to legitimate use (e.g.
 * sharing a Strava profile link).
 */
export interface ThreatScanResult {
  /** Distinct URLs detected, lowercased, with no trailing punctuation. */
  urls: string[];
  /** True if any URL looks like a known URL shortener. */
  hasShortenerUrl: boolean;
  /** True if the body mentions off-platform messaging handles. */
  hasOffPlatformContact: boolean;
  /** True if the body looks like a payment-handle ask. */
  hasPaymentHandle: boolean;
  /**
   * True if at least one signal fired. The FE uses this to decide
   * whether to render the warning chrome at all.
   */
  anyFlag: boolean;
}

// ---------------------------------------------------------------------------
// Detection patterns.
//
// Conservative on false positives — we want to NOT trigger on legitimate
// "here's my Strava" links. We want to STRONGLY trigger on patterns that
// scammers actually use (Revolut/PayPal handles, IBANs, "telegram.me/...").
// ---------------------------------------------------------------------------

const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

const URL_TRAILING_PUNCT = /[.,;:!?)\]}'"”’]+$/;

const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  'rb.gy',
  'tiny.cc',
]);

const OFF_PLATFORM_PATTERNS: RegExp[] = [
  /\b(?:t|telegram)\.me\/[a-z0-9_]+/i,
  /\bwa\.me\/\+?\d{7,}/i,
  /\bsignal\.me\/#p\/\+?\d{7,}/i,
  /\b(?:join\s+me\s+on|find\s+me\s+on|dm\s+me\s+on|add\s+me\s+on)\s+(?:telegram|whatsapp|signal|instagram|snapchat)\b/i,
  /\bmy\s+(?:telegram|whatsapp|signal|insta(?:gram)?|snapchat)\s+(?:is|handle)?\b/i,
];

const PAYMENT_HANDLE_PATTERNS: RegExp[] = [
  /\bpaypal\.me\/[a-z0-9._-]+/i,
  /\brevolut\.me\/[a-z0-9._-]+/i,
  /\bvenmo\.com\/[a-z0-9._-]+/i,
  /\bcash\.app\/\$[a-z0-9._-]+/i,
  /\bzelle\b/i,
  // IBAN — country code + 2 check digits + up to 30 alphanumeric.
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
  // BTC mainnet addresses (legacy + bech32).
  /\b(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/,
  // ETH addresses (40 hex after 0x).
  /\b0x[a-fA-F0-9]{40}\b/,
];

const CARD_DIGIT_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

@Injectable()
export class MessagingContentService {
  detectThreats(body: string): ThreatScanResult {
    if (!body || body.trim().length === 0) {
      return this.emptyResult();
    }

    const urls = this.extractUrls(body);
    const hasShortenerUrl = urls.some((u) => this.isShortener(u));
    const hasOffPlatformContact = OFF_PLATFORM_PATTERNS.some((re) =>
      re.test(body),
    );
    const hasPaymentHandle =
      PAYMENT_HANDLE_PATTERNS.some((re) => re.test(body)) ||
      this.looksLikeCardNumber(body);

    const anyFlag =
      urls.length > 0 ||
      hasShortenerUrl ||
      hasOffPlatformContact ||
      hasPaymentHandle;

    return {
      urls,
      hasShortenerUrl,
      hasOffPlatformContact,
      hasPaymentHandle,
      anyFlag,
    };
  }

  // ─────────────────────────── internal ────────────────────────────────

  private emptyResult(): ThreatScanResult {
    return {
      urls: [],
      hasShortenerUrl: false,
      hasOffPlatformContact: false,
      hasPaymentHandle: false,
      anyFlag: false,
    };
  }

  private extractUrls(body: string): string[] {
    const out = new Set<string>();
    // Iterate with index access so we can peek at the char immediately
    // preceding each match — used to skip "bob@example.com" (an email,
    // not a URL).
    let lastIndex = 0;
    const re = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[0];
      const start = m.index;
      const charBefore = start > 0 ? body[start - 1] : '';
      // Skip if this match is the domain portion of an email address.
      if (charBefore === '@') {
        lastIndex = re.lastIndex;
        continue;
      }
      const cleaned = raw.replace(URL_TRAILING_PUNCT, '').toLowerCase();
      if (cleaned.includes('@')) continue;
      if (!cleaned.includes('.')) continue;
      out.add(cleaned);
      lastIndex = re.lastIndex;
    }
    void lastIndex; // suppress unused-warning in some lint configs
    return Array.from(out);
  }

  private isShortener(url: string): boolean {
    try {
      const hostname = this.hostnameOf(url);
      return SHORTENER_HOSTS.has(hostname);
    } catch {
      return false;
    }
  }

  private hostnameOf(url: string): string {
    const withScheme =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, '');
  }

  /**
   * Luhn-validated card-shaped number detection. Strips spaces/dashes
   * then runs the standard Luhn check. We DO NOT log or store the
   * matched value anywhere — we only return the boolean.
   */
  private looksLikeCardNumber(body: string): boolean {
    const candidates = body.match(CARD_DIGIT_PATTERN) ?? [];
    for (const c of candidates) {
      const digits = c.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      if (this.luhnValid(digits)) return true;
    }
    return false;
  }

  private luhnValid(digits: string): boolean {
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }
}
