-- =========================================================
-- Migration 009: Add email_verification_expires column
-- =========================================================
-- Adds expiry tracking for email verification tokens.
-- The emailVerificationToken column already exists; this adds
-- the corresponding expiration datetime.
-- =========================================================

ALTER TABLE `user`
  ADD COLUMN `email_verification_expires` DATETIME DEFAULT NULL
  COMMENT 'Email verification token expiration'
  AFTER `email_verification_token`;
