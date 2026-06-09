-- =============================================================================
-- 051 — payments jobs: dispute table + stripe_account balance cache
-- =============================================================================
--
-- Why: the payments async-jobs sprint (Buckets C/E) needs two pieces of
-- durable state that don't exist yet:
--
--   1. `dispute` — a local mirror of Stripe disputes (chargebacks). The
--      charge.dispute.created webhook was logged-only; we now persist the
--      dispute + its evidence deadline so we can (a) notify the instructor
--      on open and (b) run the `payments.dispute_deadline` cron that
--      reminds at ~T-3 / ~T-1 before evidence is due.
--
--   2. `stripe_account` balance cache columns — the earnings dashboard
--      called `stripe.balance.retrieve` on every load. The hourly
--      `payments.balance_cache_refresh` cron writes these columns;
--      EarningsService reads them when fresh and only hits Stripe live as
--      a fallback.
--
-- Conventions: CHAR(36) PK with gen_random_uuid()::TEXT, TIMESTAMP columns,
-- snake_case (underscored ORM). Money in the smallest currency unit (cents).
-- =============================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. dispute — local mirror of a Stripe dispute (chargeback)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispute (
  id CHAR(36) NOT NULL DEFAULT gen_random_uuid()::TEXT,
  stripe_dispute_id VARCHAR(255) NOT NULL,
  stripe_charge_id VARCHAR(255) NOT NULL,
  payment_id CHAR(36),
  instructor_id CHAR(36) NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  reason VARCHAR(64),
  status VARCHAR(40) NOT NULL,
  evidence_due_by TIMESTAMP,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Keep the dispute row even if the payment is later erased (fiscal/audit).
  CONSTRAINT fk_dispute_payment FOREIGN KEY (payment_id)
    REFERENCES payment (id) ON DELETE SET NULL,
  CONSTRAINT fk_dispute_instructor FOREIGN KEY (instructor_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

-- Upsert key: one row per Stripe dispute.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_stripe_id
  ON dispute (stripe_dispute_id);
-- Deadline-reminder cron scans by status + due date.
CREATE INDEX IF NOT EXISTS idx_dispute_status_due
  ON dispute (status, evidence_due_by);
CREATE INDEX IF NOT EXISTS idx_dispute_instructor
  ON dispute (instructor_id);

-- ------------------------------------------------------------
-- 2. stripe_account — cached Stripe balance (refreshed hourly by cron)
-- ------------------------------------------------------------
ALTER TABLE stripe_account
  ADD COLUMN IF NOT EXISTS cached_balance_available_cents INTEGER,
  ADD COLUMN IF NOT EXISTS cached_balance_pending_cents INTEGER,
  ADD COLUMN IF NOT EXISTS balance_cached_at TIMESTAMP;

COMMIT;
