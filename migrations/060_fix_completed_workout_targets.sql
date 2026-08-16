-- 060: repoint "client finished a workout" alerts at the client, not the log.
--
-- `CLIENT_COMPLETED_WORKOUT` sent a workout-log id to `/coaching/clients/:id`,
-- a route that loads a *client*. The id never matched, so every one of these
-- opened an empty page. The builder now sends the client's user id; this fixes
-- the ones already written.
--
-- Where the log still exists we can recover the client from it. Where it does
-- not (the demo data has been reseeded since), dropping the id is the honest
-- outcome: the alert lands on the clients list rather than a 404.
--
-- Idempotent: the first statement only matches ids that resolve to a log, the
-- second only ids that resolve to nothing.

BEGIN;

UPDATE notification n
SET data = jsonb_set(data, '{entityId}', to_jsonb(wl.user_id)),
    updated_at = CURRENT_TIMESTAMP
FROM workout_log wl
WHERE n.type = 'CLIENT_COMPLETED_WORKOUT'
  AND n.data->>'entityId' = wl.id;

UPDATE notification
SET data = data - 'entityId',
    updated_at = CURRENT_TIMESTAMP
WHERE type = 'CLIENT_COMPLETED_WORKOUT'
  AND data ? 'entityId'
  AND NOT EXISTS (
    SELECT 1 FROM "user" u WHERE u.id = notification.data->>'entityId'
  );

COMMIT;
