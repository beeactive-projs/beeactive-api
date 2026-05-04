-- 037_group_join_requests.sql
--
-- Pending join-request workflow for APPROVAL-policy groups.
--
-- Until now, selfJoin on a group with joinPolicy = APPROVAL threw a
-- ForbiddenException ("future"). With this table the user creates a
-- PENDING request that the owner approves or rejects.
--
-- Lifecycle:
--   PENDING   -> APPROVED  : owner approved, group_member row created
--   PENDING   -> REJECTED  : owner rejected, no membership
--   PENDING   -> CANCELLED : user cancelled their own pending request
--
-- Decided rows (APPROVED/REJECTED/CANCELLED) are kept for audit; only
-- PENDING ones gate future writes. Uniqueness on (group_id, user_id)
-- is enforced only while PENDING via a partial index, so a previously-
-- decided request doesn't block a fresh request later.

BEGIN;

CREATE TABLE IF NOT EXISTS group_join_request (
  id CHAR(36) NOT NULL DEFAULT gen_random_uuid()::char(36),
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  message TEXT DEFAULT NULL,
  decided_by_id CHAR(36) DEFAULT NULL,
  decided_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_group_join_request_status
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),

  CONSTRAINT fk_gjr_group FOREIGN KEY (group_id)
    REFERENCES "group" (id) ON DELETE CASCADE,
  CONSTRAINT fk_gjr_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_gjr_decided_by FOREIGN KEY (decided_by_id)
    REFERENCES "user" (id) ON DELETE SET NULL
);

-- Only one PENDING request per (group, user). Decided rows can pile up.
CREATE UNIQUE INDEX IF NOT EXISTS uk_gjr_pending_per_user
  ON group_join_request (group_id, user_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_gjr_group_pending
  ON group_join_request (group_id, created_at DESC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_gjr_user_pending
  ON group_join_request (user_id, created_at DESC)
  WHERE status = 'PENDING';

COMMIT;
