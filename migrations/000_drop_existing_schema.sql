-- =========================================================
-- Migration 000: Drop Existing Schema (Clean Slate)
-- =========================================================
-- WARNING: This will delete ALL data!
-- Only run this in development or when doing a fresh start
-- =========================================================

USE beeactive;

-- Drop tables in reverse order of dependencies (child tables first)

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `role_permission`;
DROP TABLE IF EXISTS `user_role`;
DROP TABLE IF EXISTS `session_participant`;
DROP TABLE IF EXISTS `session`;
DROP TABLE IF EXISTS `invitation`;
DROP TABLE IF EXISTS `organization_member`;
DROP TABLE IF EXISTS `organization_subscription`;
DROP TABLE IF EXISTS `organizer_profile`;
DROP TABLE IF EXISTS `participant_profile`;
DROP TABLE IF EXISTS `social_account`;
DROP TABLE IF EXISTS `refresh_token`;
DROP TABLE IF EXISTS `organization`;
DROP TABLE IF EXISTS `subscription_plan`;
DROP TABLE IF EXISTS `feature_flag`;
DROP TABLE IF EXISTS `permission`;
DROP TABLE IF EXISTS `role`;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `_migrations`;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- Schema dropped successfully
-- =========================================================
