-- Add invited_email column to client_request for inviting non-registered users
-- Make to_user_id nullable so we can store email-only invitations

ALTER TABLE client_request
  ADD COLUMN IF NOT EXISTS invited_email VARCHAR(255);

ALTER TABLE client_request
  ALTER COLUMN to_user_id DROP NOT NULL;
