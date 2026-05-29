export function effectiveValue<T>(override: T | null | undefined, base: T): T {
  return override ?? base;
}
