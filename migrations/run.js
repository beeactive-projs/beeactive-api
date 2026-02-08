#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Runs SQL migration files using mysql2 (already installed).
 * Reads DB credentials from environment variables or .env file.
 *
 * Usage:
 *   node migrations/run.js              ← Run ALL migrations (drops everything!)
 *   node migrations/run.js --safe       ← Only run NEW migrations (skips already-run ones)
 *   node migrations/run.js --only 008   ← Run only migration 008
 *   node migrations/run.js --from 008   ← Run from 008 onwards (no drop)
 *
 * npm scripts:
 *   npm run migrate                     ← Same as node migrations/run.js
 *   npm run migrate:only 008            ← Run only 008
 *
 * On Railway (automatic on deploy):
 *   railway:start script runs with --safe flag
 *   Only NEW migrations execute, existing data is preserved
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load .env file if it exists (for local development)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

// Database config from environment
// Railway vars (MYSQLHOST) take priority over .env (DB_HOST)
const isRailway = !!process.env.MYSQLHOST;
const config = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
  user: process.env.MYSQLUSER || process.env.DB_USERNAME || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'root',
  database: process.env.MYSQLDATABASE || process.env.DB_DATABASE || 'beeactive',
  multipleStatements: true,
  // Accept Railway's self-signed SSL certificates
  ssl: isRailway ? { rejectUnauthorized: false } : undefined,
};

// All migration files in order
const ALL_MIGRATIONS = [
  '000_drop_existing_schema.sql',
  '001_create_core_tables.sql',
  '002_create_organization_tables.sql',
  '003_create_session_tables.sql',
  '004_create_profile_tables.sql',
  '005_seed_roles_permissions.sql',
  '006_seed_plans_features.sql',
  '007_create_super_admin.sql',
  '008_update_profiles_and_members.sql',
];

async function runMigrations() {
  const args = process.argv.slice(2);
  const isSafe = args.includes('--safe');
  const onlyFlag = args.indexOf('--only');
  const fromFlag = args.indexOf('--from');

  let migrations = [...ALL_MIGRATIONS];

  // --only 008 → run only that migration
  if (onlyFlag !== -1 && args[onlyFlag + 1]) {
    const target = args[onlyFlag + 1];
    migrations = ALL_MIGRATIONS.filter((m) => m.startsWith(target));
    if (migrations.length === 0) {
      console.error(`No migration found matching: ${target}`);
      process.exit(1);
    }
  }

  // --from 008 → run from that migration onwards (skip drop)
  if (fromFlag !== -1 && args[fromFlag + 1]) {
    const target = args[fromFlag + 1];
    const startIndex = ALL_MIGRATIONS.findIndex((m) => m.startsWith(target));
    if (startIndex === -1) {
      console.error(`No migration found matching: ${target}`);
      process.exit(1);
    }
    migrations = ALL_MIGRATIONS.slice(startIndex);
  }

  console.log('==========================================================');
  console.log('  BeeActive API - Database Migration Runner');
  console.log('==========================================================');
  console.log(`  Host:     ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  Mode:     ${isSafe ? 'SAFE (only new migrations)' : 'FULL (drops everything!)'}`);
  console.log('==========================================================\n');

  let connection;

  try {
    // Connect without database first (in case DB doesn't exist)
    const initConnection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      multipleStatements: true,
    });

    // Create database if it doesn't exist
    await initConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await initConnection.end();

    // Connect to the actual database
    connection = await mysql.createConnection(config);
    console.log('Connected to database.\n');

    // --safe mode: track which migrations have already run
    if (isSafe) {
      // Create tracking table if it doesn't exist
      await connection.query(`
        CREATE TABLE IF NOT EXISTS \`_migrations\` (
          \`name\` VARCHAR(255) NOT NULL PRIMARY KEY,
          \`ran_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);

      // Get already-run migrations
      const [rows] = await connection.query('SELECT name FROM `_migrations`');
      const alreadyRun = new Set(rows.map((r) => r.name));

      // Filter out already-run migrations AND the drop migration
      migrations = migrations.filter(
        (m) => !alreadyRun.has(m) && m !== '000_drop_existing_schema.sql',
      );

      if (migrations.length === 0) {
        console.log('All migrations are up to date. Nothing to run.\n');
        return;
      }

      console.log(`${migrations.length} new migration(s) to run.\n`);
    }

    let failed = 0;

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);

      if (!fs.existsSync(filePath)) {
        console.log(`SKIP: ${file} (file not found)`);
        continue;
      }

      process.stdout.write(`Running: ${file}... `);

      try {
        const sql = fs.readFileSync(filePath, 'utf-8');
        await connection.query(sql);
        console.log('OK');

        // Record migration as run (for --safe mode tracking)
        if (file !== '000_drop_existing_schema.sql') {
          try {
            await connection.query(
              'INSERT IGNORE INTO `_migrations` (name) VALUES (?)',
              [file],
            );
          } catch (_) {
            // _migrations table might not exist if running fresh (000 drops it)
          }
        }
      } catch (err) {
        console.log('FAILED');
        console.error(`  Error: ${err.message}`);
        failed++;
      }
    }

    console.log('\n==========================================================');

    if (failed === 0) {
      console.log('  All migrations completed successfully!');
      console.log('==========================================================\n');

      if (migrations.includes('007_create_super_admin.sql')) {
        console.log('Super Admin Account:');
        console.log('  Email:    beeactivedev@gmail.com');
        console.log('  Password: BeeActive2026!Admin');
        console.log('\n  IMPORTANT: Change this password after first login!\n');
      }
    } else {
      console.log(`  ${failed} migration(s) failed`);
      console.log('==========================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runMigrations();
