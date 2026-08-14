import { Op } from 'sequelize';

/**
 * Normalize a search term for consistent matching:
 * - Trims whitespace
 * - Strips diacritics/accents (e.g. "José" → "Jose", "Ștefan" → "Stefan")
 * - Collapses multiple spaces into one
 */
export function normalizeSearchTerm(term: string): string {
  return term
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Escape the characters LIKE treats as wildcards, so a term is matched
 * literally. Without it a search for `%` matches every row and `_`
 * matches any character, which reads as a broken search and makes an
 * unindexed full scan trivial to trigger.
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Build a SQL LIKE wildcard term from a raw search input.
 * Returns the normalized, escaped term wrapped in `%...%`.
 */
export function buildSearchTerm(rawTerm: string): string {
  return `%${escapeLikeWildcards(normalizeSearchTerm(rawTerm))}%`;
}

/**
 * Build an Op.or array of iLike conditions for the given fields.
 * Normalizes the search term once and applies it to all fields.
 *
 * @example
 * buildILikeConditions('yoga', ['title', 'description'])
 * // → { [Op.or]: [{ title: { [Op.iLike]: '%yoga%' } }, { description: { [Op.iLike]: '%yoga%' } }] }
 */
export function buildILikeConditions(
  rawTerm: string,
  fields: string[],
): Record<symbol, Array<Record<string, Record<symbol, string>>>> {
  const term = buildSearchTerm(rawTerm);
  return {
    [Op.or]: fields.map((field) => ({ [field]: { [Op.iLike]: term } })),
  };
}
