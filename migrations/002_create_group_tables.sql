-- =========================================================
-- Migration 002: Create Group Tables
-- =========================================================
-- Groups (formerly organizations) for instructors to manage
-- their communities, classes, and members
-- =========================================================

-- --------------------------------------------------------
-- Table: group
-- Instructor-owned groups (fitness classes, teams, communities)
-- --------------------------------------------------------
CREATE TABLE `group` (
  `id` CHAR(36) NOT NULL,
  `instructor_id` CHAR(36) NOT NULL COMMENT 'Group creator/owner (must be INSTRUCTOR)',
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(100) NOT NULL COMMENT 'URL-friendly identifier',
  `description` TEXT DEFAULT NULL,
  `logo_url` VARCHAR(500) DEFAULT NULL,
  `timezone` VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',
  `settings` JSON DEFAULT NULL COMMENT 'Group-specific settings',

  -- Status & visibility
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Visible in public search',
  `join_policy` VARCHAR(20) NOT NULL DEFAULT 'INVITE_ONLY' COMMENT 'OPEN, APPROVAL, INVITE_ONLY',
  `tags` JSON DEFAULT NULL COMMENT 'Activity tags (e.g., ["fitness","yoga","wellness"])',

  -- Contact & location
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `contact_phone` VARCHAR(20) DEFAULT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `country` VARCHAR(5) DEFAULT NULL,

  -- Denormalized count
  `member_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Denormalized member count for sorting/display',

  -- Join link
  `join_token` VARCHAR(64) DEFAULT NULL COMMENT 'Token for invite-link joining',
  `join_token_expires_at` DATETIME DEFAULT NULL COMMENT 'Join link expiration',

  -- Timestamps
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Soft delete',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_slug` (`slug`),
  KEY `idx_group_slug` (`slug`),
  KEY `idx_group_active` (`is_active`),
  KEY `idx_group_deleted_at` (`deleted_at`),
  KEY `idx_group_instructor` (`instructor_id`),
  KEY `idx_group_discovery` (`is_public`, `is_active`, `city`),
  KEY `idx_group_join_token` (`join_token`),

  CONSTRAINT `fk_group_instructor` FOREIGN KEY (`instructor_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Instructor-owned groups for managing communities and classes';

-- --------------------------------------------------------
-- Table: group_member
-- Users belonging to groups
-- --------------------------------------------------------
CREATE TABLE `group_member` (
  `id` CHAR(36) NOT NULL,
  `group_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `is_owner` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Group owner flag',
  `shared_health_info` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Consent to share health data with instructor',
  `nickname` VARCHAR(100) DEFAULT NULL COMMENT 'Optional nickname within this group',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME DEFAULT NULL COMMENT 'Member departure date',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_member` (`group_id`, `user_id`),
  KEY `idx_group_member_group` (`group_id`),
  KEY `idx_group_member_user` (`user_id`),
  KEY `idx_group_member_owner` (`group_id`, `is_owner`),

  CONSTRAINT `fk_group_member_group` FOREIGN KEY (`group_id`)
    REFERENCES `group` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_member_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Group membership';

-- --------------------------------------------------------
-- Add group FK to user_role (now that group table exists)
-- --------------------------------------------------------
ALTER TABLE `user_role`
  ADD CONSTRAINT `fk_user_role_group` FOREIGN KEY (`group_id`)
    REFERENCES `group` (`id`) ON DELETE CASCADE;

-- =========================================================
-- Group tables created successfully
-- =========================================================
