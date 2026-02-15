-- =========================================================
-- Migration 006: Create Super Admin User
-- =========================================================
-- Creates the initial super admin account
--
-- Credentials:
-- Email: beeactivedev@gmail.com
-- Password: BeeActive2026!Admin
--
-- IMPORTANT: Change this password immediately after first login!
-- =========================================================

-- --------------------------------------------------------
-- Insert Super Admin User
-- --------------------------------------------------------
INSERT INTO `user` (
  `id`,
  `email`,
  `password_hash`,
  `first_name`,
  `last_name`,
  `phone`,
  `avatar_id`,
  `language`,
  `timezone`,
  `is_active`,
  `is_email_verified`,
  `email_verification_token`,
  `email_verification_expires`,
  `password_reset_token`,
  `password_reset_expires`,
  `failed_login_attempts`,
  `locked_until`,
  `last_login_at`,
  `created_at`,
  `updated_at`,
  `deleted_at`
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'beeactivedev@gmail.com',
  '$2b$12$PLj53tJHNArlkV/GLtXI5uwri/TrGNjzJIkdQcTHI4fbhgahzfqjC',  -- BeeActive2026!Admin
  'BeeActive',
  'Admin',
  NULL,
  1,
  'en',
  'Europe/Bucharest',
  1,        -- Active
  1,        -- Email verified (super admin is pre-verified)
  NULL,
  NULL,
  NULL,
  NULL,
  0,        -- No failed attempts
  NULL,     -- Not locked
  NULL,
  NOW(),
  NOW(),
  NULL
);

-- --------------------------------------------------------
-- Assign SUPER_ADMIN Role
-- --------------------------------------------------------
INSERT INTO `user_role` (
  `id`,
  `user_id`,
  `role_id`,
  `group_id`,
  `assigned_at`,
  `expires_at`
) VALUES (
  UUID(),
  'aaaaaaaa-0000-0000-0000-000000000001',
  '7261bd94-006c-11f1-b74f-0242ac110002',  -- SUPER_ADMIN role ID
  NULL,  -- Global role, not group-specific
  NOW(),
  NULL   -- Never expires
);

-- =========================================================
-- Super Admin Created Successfully
-- =========================================================
