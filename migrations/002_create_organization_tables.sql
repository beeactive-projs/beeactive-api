-- =========================================================
-- Migration 002: Create Organization & Subscription Tables
-- =========================================================
-- Multi-tenancy support with subscription management
-- =========================================================

USE beeactive;

-- --------------------------------------------------------
-- Table: organization
-- Multi-tenant organizations (gyms, studios, teams)
-- --------------------------------------------------------
CREATE TABLE `organization` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(100) NOT NULL COMMENT 'URL-friendly identifier',
  `description` TEXT DEFAULT NULL,
  `logo_url` VARCHAR(500) DEFAULT NULL,
  `timezone` VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',
  `settings` JSON DEFAULT NULL COMMENT 'Organization-specific settings',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Soft delete',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_organization_slug` (`slug`),
  KEY `idx_organization_slug` (`slug`),
  KEY `idx_organization_active` (`is_active`),
  KEY `idx_organization_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Organizations for multi-tenancy';

-- --------------------------------------------------------
-- Table: organization_member
-- Users belonging to organizations
-- --------------------------------------------------------
CREATE TABLE `organization_member` (
  `id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `is_owner` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Organization owner flag',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME DEFAULT NULL COMMENT 'Member departure date',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_member` (`organization_id`, `user_id`),
  KEY `idx_org_member_org` (`organization_id`),
  KEY `idx_org_member_user` (`user_id`),
  KEY `idx_org_member_owner` (`organization_id`, `is_owner`),

  CONSTRAINT `fk_org_member_org` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_member_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Organization membership';

-- --------------------------------------------------------
-- Table: subscription_plan
-- Available subscription tiers (Free, Pro, Enterprise)
-- --------------------------------------------------------
CREATE TABLE `subscription_plan` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NOT NULL COMMENT 'Plan identifier',
  `description` TEXT DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL COMMENT 'Price in currency',
  `currency` VARCHAR(3) NOT NULL DEFAULT 'RON',
  `billing_period` ENUM('MONTHLY', 'YEARLY', 'LIFETIME') NOT NULL,
  `max_clients` INT DEFAULT NULL COMMENT 'NULL = unlimited',
  `max_sessions` INT DEFAULT NULL COMMENT 'NULL = unlimited',
  `features` JSON DEFAULT NULL COMMENT 'Available features list',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `display_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order for display',
  `stripe_price_id` VARCHAR(255) DEFAULT NULL COMMENT 'Stripe Price ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subscription_plan_slug` (`slug`),
  KEY `idx_subscription_plan_slug` (`slug`),
  KEY `idx_subscription_plan_active` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Subscription plan definitions';

-- --------------------------------------------------------
-- Table: organization_subscription
-- Active subscriptions for organizations
-- --------------------------------------------------------
CREATE TABLE `organization_subscription` (
  `id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `current_period_start` DATETIME NOT NULL,
  `current_period_end` DATETIME NOT NULL,
  `cancelled_at` DATETIME DEFAULT NULL,
  `stripe_subscription_id` VARCHAR(255) DEFAULT NULL COMMENT 'Stripe Subscription ID',
  `stripe_customer_id` VARCHAR(255) DEFAULT NULL COMMENT 'Stripe Customer ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_subscription` (`organization_id`),
  KEY `idx_org_subscription_status` (`status`),
  KEY `idx_org_subscription_period_end` (`current_period_end`),
  KEY `idx_org_subscription_plan` (`plan_id`),

  CONSTRAINT `fk_org_subscription_org` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_subscription_plan` FOREIGN KEY (`plan_id`)
    REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Organization subscriptions';

-- --------------------------------------------------------
-- Table: feature_flag
-- Feature flags for gradual rollout and A/B testing
-- --------------------------------------------------------
CREATE TABLE `feature_flag` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL COMMENT 'Feature key (e.g., advanced_analytics)',
  `name` VARCHAR(100) NOT NULL COMMENT 'Human-readable name',
  `description` TEXT DEFAULT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Globally enabled',
  `required_plans` JSON DEFAULT NULL COMMENT 'Plans that have access',
  `metadata` JSON DEFAULT NULL COMMENT 'Additional configuration',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_feature_flag_key` (`key`),
  KEY `idx_feature_flag_key` (`key`),
  KEY `idx_feature_flag_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Feature flags for controlled rollout';

-- --------------------------------------------------------
-- Add organization FK to user_role (now that organization exists)
-- --------------------------------------------------------
ALTER TABLE `user_role`
  ADD CONSTRAINT `fk_user_role_org` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`id`) ON DELETE CASCADE;

-- =========================================================
-- Organization tables created successfully
-- =========================================================
