import {
  buildSearchTerm,
  escapeLikeWildcards,
  normalizeSearchTerm,
} from './search.utils';

describe('search.utils', () => {
  describe('escapeLikeWildcards', () => {
    it('escapes the characters LIKE treats as wildcards', () => {
      expect(escapeLikeWildcards('100%')).toBe('100\\%');
      expect(escapeLikeWildcards('a_b')).toBe('a\\_b');
      expect(escapeLikeWildcards('back\\slash')).toBe('back\\\\slash');
    });

    it('leaves an ordinary term untouched', () => {
      expect(escapeLikeWildcards('push day')).toBe('push day');
    });
  });

  describe('buildSearchTerm', () => {
    // A bare % used to match every row, which reads as a broken search
    // and makes an unindexed full scan trivial to trigger.
    it('does not let a wildcard term match everything', () => {
      expect(buildSearchTerm('%')).toBe('%\\%%');
    });

    it('still strips diacritics and collapses whitespace', () => {
      expect(buildSearchTerm('  Ștefan   Pop ')).toBe('%Stefan Pop%');
    });
  });

  describe('normalizeSearchTerm', () => {
    it('trims, strips accents and collapses spaces', () => {
      expect(normalizeSearchTerm('  José   María ')).toBe('Jose Maria');
    });
  });
});
