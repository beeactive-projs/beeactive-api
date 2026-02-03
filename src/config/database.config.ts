'use strict';

import { ConfigService } from '@nestjs/config';
import { SequelizeModuleOptions } from '@nestjs/sequelize';
export const getDatabaseConfig = (
  configService: ConfigService,
): SequelizeModuleOptions => ({
  dialect: 'mysql',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_DATABASE'), // Auto-discover and register all @Table() decorated classes
  autoLoadModels: true, // Don't auto-create tables (we use SQL schema - you already have tables!)
  synchronize: false, // Show SQL queries in console during development
  logging:
    configService.get<string>('NODE_ENV') === 'development'
      ? console.log
      : false, // Timezone setting (important for DATETIME fields)
  timezone: '+02:00', // Romania timezone (EET/EEST)// Connection pool settings (for production)
  pool: {
    max: 10, // Maximum number of connections
    min: 0, // Minimum number of connections
    acquire: 30000, // Maximum time (ms) to try to get connection
    idle: 10000, // Maximum time (ms) a connection can be idle
  }, // Retry settings
  retry: {
    max: 3, // Retry failed connections 3 times
  },
});
