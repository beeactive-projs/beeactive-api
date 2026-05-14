/**
 * Jest globalSetup: loads .env.test before any test file runs.
 * This ensures NODE_ENV=test and the test DB vars are set before
 * @nestjs/config reads the environment.
 *
 * Integration tests that need real Postgres should assert
 * process.env.NODE_ENV === 'test' at the top of the file to prevent
 * accidental runs against the dev DB.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});
