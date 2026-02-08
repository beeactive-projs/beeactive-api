import * as Joi from 'joi';

/**
 * Environment Variables Validation Schema
 *
 * This ensures all required environment variables are present when the app starts.
 * If any required variable is missing, the app will crash immediately with a clear error.
 *
 * Think of this as a "contract" - the app won't start unless all these are provided.
 */
export const envValidationSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Server Configuration
  PORT: Joi.number().default(3000),

  // Database Configuration (all required!)
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  // Redis Configuration (optional — only needed when using Bull queues)
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().default(6379),

  // JWT Configuration (CRITICAL - no defaults allowed!)
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Frontend URL for CORS (required in production)
  FRONTEND_URL: Joi.string().uri().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // Bcrypt rounds (default: 12)
  BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12),
});
