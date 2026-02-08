import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Strong Password Validator
 *
 * Custom validator to ensure passwords meet security requirements:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character (!@#$%^&*)
 *
 * Why? Weak passwords are the #1 cause of account breaches.
 */
@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string) {
    if (!password) return false;

    // Check length
    if (password.length < 8) return false;

    // Check for uppercase
    if (!/[A-Z]/.test(password)) return false;

    // Check for lowercase
    if (!/[a-z]/.test(password)) return false;

    // Check for number
    if (!/[0-9]/.test(password)) return false;

    // Check for special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;

    return true;
  }

  defaultMessage() {
    return 'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character (!@#$%^&*...)';
  }
}

/**
 * @IsStrongPassword() Decorator
 *
 * Usage in DTOs:
 * ```typescript
 * @IsStrongPassword()
 * password: string;
 * ```
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
