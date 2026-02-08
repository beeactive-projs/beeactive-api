import { ConfigService } from '@nestjs/config';
import { SequelizeModuleOptions } from '@nestjs/sequelize';

/**
 * Database Configuration Factory
 *
 * Creates Sequelize configuration for MySQL connection.
 * Called once when the app starts (see app.module.ts).
 *
 * Key settings:
 * - synchronize: false → We manage schema manually (safer for production)
 * - autoLoadModels: true → Auto-discover @Table() entities
 * - pool → Connection pooling for better performance
 * - dialectOptions → MySQL-specific settings (SSL, timezone, etc.)
 */
export const getDatabaseConfig = (
  configService: ConfigService,
): SequelizeModuleOptions => ({
  dialect: 'mysql',
  host: configService.get<string>('DB_HOST') || configService.get<string>('MYSQLHOST'),
  port: configService.get<number>('DB_PORT') || configService.get<number>('MYSQLPORT'),
  username: configService.get<string>('DB_USERNAME') || configService.get<string>('MYSQLUSER'),
  password: configService.get<string>('DB_PASSWORD') || configService.get<string>('MYSQLPASSWORD'),
  database: configService.get<string>('DB_DATABASE') || configService.get<string>('MYSQLDATABASE'),

  // Auto-discover and register all @Table() decorated classes
  autoLoadModels: true,

  // Don't auto-create tables (we use SQL schema - you already have tables!)
  synchronize: false,

  // Show SQL queries in console during development only
  logging:
    configService.get<string>('NODE_ENV') === 'development'
      ? console.log
      : false,

  // Timezone setting (important for DATETIME fields)
  // Use UTC for production to avoid timezone issues, local time for dev
  timezone:
    configService.get<string>('NODE_ENV') === 'production'
      ? '+00:00' // UTC for production (Railway MySQL uses UTC)
      : '+02:00', // Romania timezone (EET/EEST) for local dev

  // Connection pool settings (for production)
  pool: {
    max: 10, // Maximum number of connections
    min: 0, // Minimum number of connections
    acquire: 30000, // Maximum time (ms) to try to get connection
    idle: 10000, // Maximum time (ms) a connection can be idle
  },

  // Retry settings
  retry: {
    max: 3, // Retry failed connections 3 times
  },

  // Dialect-specific options
  dialectOptions: {
    connectTimeout: 60000, // 60 seconds connection timeout

    // Production-specific settings
    ...(configService.get<string>('NODE_ENV') === 'production' && {
      // Handle connection drops
      keepAlive: true,

      // SSL Configuration
      // Railway MySQL uses self-signed certificates on internal network
      // rejectUnauthorized: false is acceptable here because Railway's
      // internal networking is already isolated and encrypted
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  },

  // Define models directory (helps with auto-discovery)
  // This ensures Sequelize finds all your entities
  define: {
    timestamps: true, // Automatically manage createdAt/updatedAt
    underscored: true, // Use snake_case for DB columns (firstName → first_name)
    freezeTableName: true, // Don't pluralize table names (user stays user, not users)
  },
});
