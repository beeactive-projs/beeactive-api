# BeeActive API – Deploy & Migrations

This document explains how database migrations run on deploy and how to fix issues when they do not.

---

## Quick check: did migrations run on the server?

After deploying, you can verify that migrations ran:

1. **Railway** – In the deploy logs you should see output from the migration runner before the app starts, e.g.:
   ```
   Running: 009_add_email_verification_expires.sql... OK
   Running: 010_add_organization_discovery_fields.sql... OK
   ```
2. **Database** – If you have access to the production DB, check that the `_migrations` table contains the latest migration names (e.g. `010_add_organization_discovery_fields.sql`). New columns/tables from 009 and 010 should exist.

If you do **not** see migration output in the logs and new columns are missing, the start command is likely not running migrations. See below.

---

## How migrations run on deploy

Migrations run **only if** the process that starts your app also runs the migration script. By default some platforms run only `npm start` or `npm run start:prod`, which **do not** run migrations.

### What you need

The **production start command** must run migrations first, then start the app:

1. **Build** the app (if not already built by the platform).
2. **Run migrations** with `node migrations/run.js --safe` (so only **new** migrations run; existing data is kept).
3. **Start** the app with `node dist/main` (or `npm run start:prod`).

In this project that is done by a single script:

- **`npm run railway:start`** = `npm run build` → `node migrations/run.js --safe` → `npm run start:prod`

So: **your deploy start command must be `npm run railway:start`** (or equivalent). The name is Railway-oriented but the script works on any platform.

### What `--safe` does

- Reads the `_migrations` table to see which migration files have already been run.
- Runs **only** migration files that are not yet recorded.
- Does **not** run the drop script (`000_drop_existing_schema.sql`), so existing data is preserved.

---

## Railway

### Option 1: Use `railway.toml` (recommended)

This repo includes a **`railway.toml`** at the project root:

```toml
[deploy]
startCommand = "npm run railway:start"
```

If this file is committed and deployed, Railway will use this start command. No need to set it in the dashboard. After the next deploy, new migrations (e.g. 009, 010) will run automatically before the app starts.

### Option 2: Set the start command in the dashboard

1. Open your **BeeActive API** service in the Railway dashboard.
2. Go to **Settings** → **Deploy** (or the section where **Start Command** is configured).
3. Set the start command to:
   ```bash
   npm run railway:start
   ```
4. Redeploy. On each deploy, new migrations will run before the app starts.

### If migrations still did not run

- Confirm the start command is exactly `npm run railway:start` (no typo, no extra quotes).
- Check deploy logs for migration output (see “Quick check” above).
- If the start command was wrong on previous deploys, run the missing migrations once manually (see “Running migrations manually” below), then fix the start command and redeploy so future migrations run automatically.

---

## Other platforms (Render, Fly.io, Vercel, etc.)

Use the same idea: the **production start command** must run migrations then start the app.

- **Option A** – Use the same script (works even when not on Railway):
  ```bash
  npm run railway:start
  ```

- **Option B** – Run migrations and start explicitly:
  ```bash
  npm run build && node migrations/run.js --safe && node dist/main
  ```

Do **not** use only `npm run start:prod` or `node dist/main` as the start command, or new migrations will never run on deploy.

---

## Running migrations manually

Useful when fixing a server where migrations did not run, or when developing locally.

| Goal | Command |
|------|--------|
| Run only **new** migrations (safe, recommended) | `node migrations/run.js --safe` |
| Run from a specific migration onward (e.g. 009 and 010) | `node migrations/run.js --from 009` |
| Run only one migration file | `node migrations/run.js --only 010` |

For production, ensure the correct database URL (e.g. `MYSQL_PUBLIC_URL` or `DATABASE_URL`) is set in the environment before running the command.

**Example – run missing migrations once on the server:**

```bash
# With production env vars loaded (e.g. MYSQL_PUBLIC_URL):
node migrations/run.js --from 009
```

After that, set the deploy start command to `npm run railway:start` and redeploy so future migrations run automatically.

---

## Summary

| Item | What to do |
|------|------------|
| **Migrations run on deploy** | Use start command: `npm run railway:start`. Commit `railway.toml` so Railway uses it. |
| **Verify after deploy** | Check deploy logs for migration lines; or check `_migrations` table / new columns in DB. |
| **Migrations never ran on server** | Run once: `node migrations/run.js --from 009` (with prod env). Then set start command and redeploy. |
