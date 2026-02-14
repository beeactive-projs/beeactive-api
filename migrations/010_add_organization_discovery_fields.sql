-- Migration 010: Add organization discovery fields
-- Adds isPublic, type, joinPolicy, and contact/location fields to organizations

ALTER TABLE `organization`
  ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Whether this org appears in public search results'
    AFTER `is_active`,
  ADD COLUMN `type` VARCHAR(50) DEFAULT 'OTHER'
    COMMENT 'Organization type: FITNESS, YOGA, DANCE, CROSSFIT, MARTIAL_ARTS, SWIMMING, RUNNING, CYCLING, PILATES, SPORTS_TEAM, PERSONAL_TRAINING, OTHER'
    AFTER `is_public`,
  ADD COLUMN `join_policy` VARCHAR(20) DEFAULT 'INVITE_ONLY'
    COMMENT 'How new members join: OPEN (anyone), REQUEST (needs approval), INVITE_ONLY (invitation required)'
    AFTER `type`,
  ADD COLUMN `contact_email` VARCHAR(255) DEFAULT NULL
    AFTER `join_policy`,
  ADD COLUMN `contact_phone` VARCHAR(20) DEFAULT NULL
    AFTER `contact_email`,
  ADD COLUMN `address` VARCHAR(500) DEFAULT NULL
    AFTER `contact_phone`,
  ADD COLUMN `city` VARCHAR(100) DEFAULT NULL
    AFTER `address`,
  ADD COLUMN `country` VARCHAR(5) DEFAULT NULL
    AFTER `city`,
  ADD COLUMN `member_count` INT UNSIGNED DEFAULT 0
    COMMENT 'Denormalized member count for sorting/display'
    AFTER `country`;

-- Index for discovery queries
CREATE INDEX `idx_org_discovery` ON `organization` (`is_public`, `is_active`, `type`, `city`);
