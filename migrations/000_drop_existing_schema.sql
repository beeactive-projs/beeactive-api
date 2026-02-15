-- =========================================================
-- Migration 000: Drop Existing Schema (Clean Slate)
-- =========================================================
-- WARNING: This will delete ALL data!
-- Only run this in development or when doing a fresh start
-- =========================================================

-- Drop tables in reverse order of dependencies (child tables first)

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `role_permission`;
DROP TABLE IF EXISTS `user_role`;
DROP TABLE IF EXISTS `session_participant`;
DROP TABLE IF EXISTS `session`;
DROP TABLE IF EXISTS `invitation`;
DROP TABLE IF EXISTS `client_request`;
DROP TABLE IF EXISTS `instructor_client`;
DROP TABLE IF EXISTS `group_member`;
DROP TABLE IF EXISTS `instructor_profile`;
DROP TABLE IF EXISTS `user_profile`;
DROP TABLE IF EXISTS `social_account`;
DROP TABLE IF EXISTS `refresh_token`;
DROP TABLE IF EXISTS `group`;
DROP TABLE IF EXISTS `permission`;
DROP TABLE IF EXISTS `role`;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `_migrations`;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- Schema dropped successfully
-- =========================================================
