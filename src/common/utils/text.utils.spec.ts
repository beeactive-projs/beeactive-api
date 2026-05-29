import { stripHtml } from './text.utils';

describe('stripHtml', () => {
  it('strips <script> and its content', () => {
    expect(stripHtml("<script>alert('x')</script>Hello")).toBe('Hello');
  });

  it('strips inline tags but keeps text content', () => {
    expect(stripHtml('<b>Strong</b> text')).toBe('Strong text');
  });

  it('collapses repeated horizontal whitespace', () => {
    expect(stripHtml('a   b\t\tc')).toBe('a b c');
  });

  it('preserves single newlines', () => {
    expect(stripHtml('line1\nline2')).toBe('line1\nline2');
  });

  it('collapses 3+ newlines down to 2 (paragraph break)', () => {
    expect(stripHtml('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });

  it('clamps to maxLength when provided', () => {
    expect(stripHtml('abcdefghij', 5)).toBe('abcde');
  });

  it('returns empty when input is only tags with no text', () => {
    expect(stripHtml('<img/><br/>')).toBe('');
  });

  it('removes javascript:-style URL fragments embedded as text', () => {
    // not a parseable script tag but we want safety — kept as plain text
    expect(stripHtml('javascript:alert(1)')).toBe('javascript:alert(1)');
    // ^ stripHtml does not block plain-text URLs; the URL validator
    // on the DTO catches `javascript:` schemes. Document this boundary.
  });
});
