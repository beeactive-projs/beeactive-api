-- =========================================================
-- Migration 001: Create Core Tables (User, Role, Permission)
-- =========================================================
-- Creates the foundation tables for authentication and RBAC
-- Includes all security improvements
-- =========================================================

USE beeactive;

-- --------------------------------------------------------
-- Table: user
-- Core user authentication and profile
-- --------------------------------------------------------
CREATE TABLE `user` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,  -- ✅ SECURITY: NOT NULL (required)
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `avatar_id` TINYINT UNSIGNED DEFAULT 1,
  `language` VARCHAR(5) NOT NULL DEFAULT 'en',
  `timezone` VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',

  -- Account Status
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_email_verified` TINYINT(1) NOT NULL DEFAULT 0,

  -- ✅ SECURITY: Hashed token storage (SHA-256)
  `email_verification_token` VARCHAR(255) DEFAULT NULL COMMENT 'SHA-256 hash of verification token',
  `password_reset_token` VARCHAR(255) DEFAULT NULL COMMENT 'SHA-256 hash of reset token',
  `password_reset_expires` DATETIME DEFAULT NULL,

  -- ✅ SECURITY: Account lockout fields
  `failed_login_attempts` INT NOT NULL DEFAULT 0 COMMENT 'Failed login counter',
  `locked_until` DATETIME DEFAULT NULL COMMENT 'Account locked until this time',

  -- Timestamps
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Soft delete timestamp',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_email` (`email`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_deleted_at` (`deleted_at`),
  KEY `idx_user_locked_until` (`locked_until`),
  KEY `idx_user_email_verified` (`is_email_verified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Core user accounts with security features';

-- --------------------------------------------------------
-- Table: role
-- User roles for RBAC (Role-Based Access Control)
-- --------------------------------------------------------
CREATE TABLE `role` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(50) NOT NULL COMMENT 'Unique role identifier (e.g., SUPER_ADMIN)',
  `display_name` VARCHAR(100) NOT NULL COMMENT 'Human-readable name',
  `description` TEXT DEFAULT NULL,
  `level` INT NOT NULL DEFAULT 10 COMMENT 'Role hierarchy (lower = more powerful)',
  `is_system_role` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Cannot be deleted',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_name` (`name`),
  KEY `idx_role_name` (`name`),
  KEY `idx_role_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User roles for access control';

-- --------------------------------------------------------
-- Table: permission
-- Granular permissions for fine-grained access control
-- --------------------------------------------------------
CREATE TABLE `permission` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL COMMENT 'Unique permission key (e.g., user.create)',
  `display_name` VARCHAR(100) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `resource` VARCHAR(50) NOT NULL COMMENT 'Resource type (user, session, etc.)',
  `action` VARCHAR(50) NOT NULL COMMENT 'Action (create, read, update, delete)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_name` (`name`),
  KEY `idx_permission_name` (`name`),
  KEY `idx_permission_resource` (`resource`),
  KEY `idx_permission_resource_action` (`resource`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Granular permissions for RBAC';

-- --------------------------------------------------------
-- Table: user_role
-- Junction table: Users to Roles (Many-to-Many)
-- --------------------------------------------------------
CREATE TABLE `user_role` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) DEFAULT NULL COMMENT 'Scope role to organization (optional)',
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME DEFAULT NULL COMMENT 'Temporary role expiration',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role_org` (`user_id`, `role_id`, `organization_id`),
  KEY `idx_user_role_user` (`user_id`),
  KEY `idx_user_role_role` (`role_id`),
  KEY `idx_user_role_org` (`organization_id`),
  KEY `idx_user_role_expires` (`expires_at`),

  CONSTRAINT `fk_user_role_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_role_role` FOREIGN KEY (`role_id`)
    REFERENCES `role` (`id`) ON DELETE CASCADE
  -- Note: organization FK added in later migration
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User role assignments';

-- --------------------------------------------------------
-- Table: role_permission
-- Junction table: Roles to Permissions (Many-to-Many)
-- --------------------------------------------------------
CREATE TABLE `role_permission` (
  `id` CHAR(36) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
  KEY `idx_role_permission_role` (`role_id`),
  KEY `idx_role_permission_permission` (`permission_id`),

  CONSTRAINT `fk_role_permission_role` FOREIGN KEY (`role_id`)
    REFERENCES `role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permission_permission` FOREIGN KEY (`permission_id`)
    REFERENCES `permission` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permission assignments to roles';

-- --------------------------------------------------------
-- Table: refresh_token
-- ✅ SECURITY: Refresh token storage for JWT renewal
-- --------------------------------------------------------
CREATE TABLE `refresh_token` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL COMMENT 'SHA-256 hash of refresh token',
  `device_info` VARCHAR(255) DEFAULT NULL COMMENT 'User agent string',
  `ip_address` VARCHAR(45) DEFAULT NULL COMMENT 'IPv4 or IPv6 address',
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME DEFAULT NULL COMMENT 'Manual revocation timestamp',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_refresh_token_user_hash` (`user_id`, `token_hash`),
  KEY `idx_refresh_token_expires` (`expires_at`),
  KEY `idx_refresh_token_revoked` (`revoked_at`),

  CONSTRAINT `fk_refresh_token_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Refresh tokens for JWT authentication';

-- --------------------------------------------------------
-- Table: social_account
-- OAuth social login integration
-- --------------------------------------------------------
CREATE TABLE `social_account` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `provider` ENUM('GOOGLE', 'FACEBOOK', 'APPLE') NOT NULL,
  `provider_user_id` VARCHAR(255) NOT NULL COMMENT 'User ID from provider',
  `provider_email` VARCHAR(255) DEFAULT NULL,
  `access_token` TEXT DEFAULT NULL COMMENT 'OAuth access token',
  `refresh_token` TEXT DEFAULT NULL COMMENT 'OAuth refresh token',
  `token_expires_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_social_provider_user` (`provider`, `provider_user_id`),
  KEY `idx_social_account_user` (`user_id`),
  KEY `idx_social_account_provider` (`provider`),

  CONSTRAINT `fk_social_account_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Social OAuth account linkage';

-- =========================================================
-- Core tables created successfully
-- =========================================================
