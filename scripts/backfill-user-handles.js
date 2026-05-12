#!/usr/bin/env node

/**
 * Backfill `user.handle` for every account that still has NULL after
 * migration 040.
 *
 * Migration 040 copies handles from `instructor_profile.handle` for
 * existing instructors but leaves every other account NULL — generating
 * a unique slug with retry-on-collision is awkward in pure SQL, so it
 * lives here.
 *
 * Strategy per row:
 *   1. Slugify `<first>-<last>` (lowercase, strip diacritics, only
 *      alphanumerics + dashes, collapse repeats).
 *   2. Fall back to `user` when the slug is empty (unicode-only names).
 *   3. Append `-<short>` where `<short>` is a 6-char base36 nanoid-ish
 *      suffix derived from the row UUID + a counter; retry up to 5
 *      times if the unique index rejects the candidate.
 *
 * Idempotent: re-running skips rows that already have a handle. Run
 * once in dev → once in prod → land migration 041 (NOT NULL).
 *
 * Usage:
 *   node scripts/backfill-user-handles.js
 *   node scripts/backfill-user-handles.js --dry-run
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const dryRun = process.argv.includes('--dry-run');

function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function shortSuffix() {
  // 6 chars from base36 of 4 random bytes — collision space ~2.2bn,
  // ample once combined with the slug.
  return crypto.randomBytes(4).readUInt32BE(0).toString(36).padStart(6, '0').slice(-6);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();
  console.log(`[backfill] connected${dryRun ? ' (dry-run)' : ''}`);

  const { rows } = await client.query(
    `SELECT id, first_name, last_name
       FROM "user"
      WHERE handle IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at ASC`,
  );

  console.log(`[backfill] ${rows.length} users without a handle`);

  let assigned = 0;
  for (const row of rows) {
    const base = slugify(`${row.first_name || ''}-${row.last_name || ''}`)
      || 'user';

    let success = false;
    for (let attempt = 0; attempt < 5 && !success; attempt += 1) {
      const candidate = `${base}-${shortSuffix()}`.slice(0, 40);
      if (dryRun) {
        console.log(`[backfill] ${row.id} → ${candidate} (dry-run)`);
        success = true;
        break;
      }
      try {
        await client.query(
          `UPDATE "user" SET handle = $1 WHERE id = $2 AND handle IS NULL`,
          [candidate, row.id],
        );
        success = true;
        assigned += 1;
        if (assigned % 25 === 0) {
          console.log(`[backfill] assigned ${assigned} handles…`);
        }
      } catch (err) {
        // 23505 = unique_violation. Retry with a fresh suffix.
        if (err && err.code === '23505') continue;
        throw err;
      }
    }

    if (!success) {
      console.warn(
        `[backfill] could not assign a unique handle for ${row.id} after 5 tries`,
      );
    }
  }

  console.log(`[backfill] done. assigned=${assigned} dryRun=${dryRun}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
