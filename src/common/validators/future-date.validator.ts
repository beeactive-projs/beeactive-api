import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

interface FutureDateOptions {
  /**
   * Allow up to N minutes in the past to absorb clock skew between
   * client and server. Default 5.
   */
  skewMinutes?: number;
}

/**
 * @IsFutureOrCloseToNow — the value (an ISO 8601 string or Date)
 * must be in the future, with a small grace window for client clock
 * skew.
 *
 * Designed for "scheduled at" / "starts at" fields where backdating
 * a record makes no functional sense (sessions, reminders, etc.).
 *
 * Defaults to a 5-minute skew tolerance. Pass `skewMinutes: 0` to
 * forbid any past timestamp.
 *
 * @example
 * @IsFutureOrCloseToNow({ skewMinutes: 5 })
 * firstStartAt: string;
 */
export function IsFutureOrCloseToNow(
  options: FutureDateOptions = {},
  validationOptions?: ValidationOptions,
) {
  const skewMinutes = options.skewMinutes ?? 5;
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isFutureOrCloseToNow',
      target: object.constructor,
      propertyName,
      constraints: [skewMinutes],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value == null) return false;
          const parsed =
            value instanceof Date ? value : new Date(value as string);
          if (Number.isNaN(parsed.getTime())) return false;
          const earliest = Date.now() - skewMinutes * 60_000;
          return parsed.getTime() >= earliest;
        },
        defaultMessage(args: ValidationArguments) {
          const [m] = args.constraints as [number];
          return `${args.property} must be a future date (up to ${m} min past tolerated)`;
        },
      },
    });
  };
}
