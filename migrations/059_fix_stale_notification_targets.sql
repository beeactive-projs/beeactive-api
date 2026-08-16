-- 059: repoint notifications whose click target no longer exists.
--
-- `data.screen` is written once, when the notification is created, and read
-- every time someone taps it — so a route that moves leaves every historical
-- notification pointing at a 404. Two such moves have happened:
--
--   my/plans        → user/plans   (the IA refactor moved the client's plans
--                                   under /user/*; nothing redirected the old
--                                   path, so "New program assigned" was a dead
--                                   tap for every client who had one)
--   coaching/payments/:id          (the payment/dispute id was appended to a
--                                   route that takes no parameter; there is no
--                                   payment or dispute page, so the id is
--                                   dropped and the alert lands on the
--                                   payments page it was always about)
--
-- Idempotent: matching on the old value means a re-run finds nothing.

BEGIN;

UPDATE notification
SET data = jsonb_set(data, '{screen}', '"user/plans"'),
    updated_at = CURRENT_TIMESTAMP
WHERE data->>'screen' = 'my/plans';

-- Dispute and refund-window alerts carried an entityId onto a route with no
-- `:id` segment. Strip the id; the screen itself is correct.
UPDATE notification
SET data = data - 'entityId',
    updated_at = CURRENT_TIMESTAMP
WHERE data->>'screen' = 'coaching/payments'
  AND data ? 'entityId'
  AND type IN ('DISPUTE_OPENED', 'DISPUTE_EVIDENCE_DUE');

-- A refund-window alert can be repointed at the invoice it is about, which is
-- where the refund is actually issued. Payments with no invoice behind them
-- fall back to the payments page.
UPDATE notification n
SET data = jsonb_build_object('screen', 'coaching/invoices', 'entityId', p.invoice_id),
    updated_at = CURRENT_TIMESTAMP
FROM payment p
WHERE n.type = 'REFUND_WINDOW_CLOSING'
  AND n.data->>'screen' = 'coaching/payments'
  AND n.data->>'entityId' = p.id
  AND p.invoice_id IS NOT NULL;

UPDATE notification
SET data = data - 'entityId',
    updated_at = CURRENT_TIMESTAMP
WHERE type = 'REFUND_WINDOW_CLOSING'
  AND data->>'screen' = 'coaching/payments'
  AND data ? 'entityId';

COMMIT;
