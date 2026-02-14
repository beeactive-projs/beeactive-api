import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * CamelCase Response Interceptor
 *
 * Transforms all response keys from snake_case to camelCase.
 *
 * Convention:
 * - Database columns use snake_case (e.g., first_name, created_at)
 * - API responses use camelCase (e.g., firstName, createdAt)
 *
 * Sequelize's `underscored: true` handles the DB ↔ model mapping.
 * This interceptor acts as a safety net to guarantee all API responses
 * are consistently camelCase, even for manually constructed objects.
 *
 * Applied globally in AppModule.
 */
@Injectable()
export class CamelCaseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transformKeys(data)));
  }

  /**
   * Recursively transform all object keys to camelCase
   */
  private transformKeys(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.transformKeys(item));
    }

    if (data instanceof Date) {
      return data;
    }

    if (typeof data === 'object' && data.constructor === Object) {
      const transformed: Record<string, any> = {};

      for (const key of Object.keys(data)) {
        const camelKey = this.toCamelCase(key);
        transformed[camelKey] = this.transformKeys(data[key]);
      }

      return transformed;
    }

    // Handle Sequelize model instances (they have toJSON)
    if (typeof data === 'object' && typeof data.toJSON === 'function') {
      return this.transformKeys(data.toJSON());
    }

    return data;
  }

  /**
   * Convert a snake_case string to camelCase
   *
   * Examples:
   * - "first_name" → "firstName"
   * - "created_at" → "createdAt"
   * - "firstName" → "firstName" (already camelCase, no change)
   * - "id" → "id" (single word, no change)
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
