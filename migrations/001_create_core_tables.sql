-- =========================================================
-- Migration 001: Create Core Tables (User, Role, Permission)
-- =========================================================
-- Creates the foundation tables for authentication and RBAC
-- =========================================================

-- --------------------------------------------------------
-- Enum type for social account providers
-- --------------------------------------------------------
CREATE TYPE enum_social_provider AS ENUM ('GOOGLE', 'FACEBOOK', 'APPLE');

-- --------------------------------------------------------
-- Table: user
-- Core user authentication and profile
-- --------------------------------------------------------
CREATE TABLE "user" (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) DEFAULT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  avatar_id SMALLINT DEFAULT 1,
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',

  -- Account Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  -- Security: Hashed token storage (SHA-256)
  email_verification_token VARCHAR(255) DEFAULT NULL,
  email_verification_expires TIMESTAMP DEFAULT NULL,
  password_reset_token VARCHAR(255) DEFAULT NULL,
  password_reset_expires TIMESTAMP DEFAULT NULL,

  -- Security: Account lockout fields
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP DEFAULT NULL,

  -- Timestamps
  last_login_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT uk_user_email UNIQUE (email)
);

CREATE INDEX idx_user_email ON "user" (email);
CREATE INDEX idx_user_deleted_at ON "user" (deleted_at);
CREATE INDEX idx_user_locked_until ON "user" (locked_until);
CREATE INDEX idx_user_email_verified ON "user" (is_email_verified);

-- --------------------------------------------------------
-- Table: role
-- User roles for RBAC (Role-Based Access Control)
-- --------------------------------------------------------
CREATE TABLE role (
  id CHAR(36) NOT NULL,
  name VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  level INT NOT NULL DEFAULT 10,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_role_name UNIQUE (name)
);

CREATE INDEX idx_role_name ON role (name);
CREATE INDEX idx_role_level ON role (level);

-- --------------------------------------------------------
-- Table: permission
-- Granular permissions for fine-grained access control
-- --------------------------------------------------------
CREATE TABLE permission (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_permission_name UNIQUE (name)
);

CREATE INDEX idx_permission_name ON permission (name);
CREATE INDEX idx_permission_resource ON permission (resource);
CREATE INDEX idx_permission_resource_action ON permission (resource, action);

-- --------------------------------------------------------
-- Table: user_role
-- Junction table: Users to Roles (Many-to-Many)
-- --------------------------------------------------------
CREATE TABLE user_role (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  group_id CHAR(36) DEFAULT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT uk_user_role_group UNIQUE (user_id, role_id, group_id),

  CONSTRAINT fk_user_role_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id)
    REFERENCES role (id) ON DELETE CASCADE
  -- Note: group FK added in migration 002 after group table exists
);

CREATE INDEX idx_user_role_user ON user_role (user_id);
CREATE INDEX idx_user_role_role ON user_role (role_id);
CREATE INDEX idx_user_role_group ON user_role (group_id);
CREATE INDEX idx_user_role_expires ON user_role (expires_at);

-- --------------------------------------------------------
-- Table: role_permission
-- Junction table: Roles to Permissions (Many-to-Many)
-- --------------------------------------------------------
CREATE TABLE role_permission (
  id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_role_permission UNIQUE (role_id, permission_id),

  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id)
    REFERENCES role (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id)
    REFERENCES permission (id) ON DELETE CASCADE
);

CREATE INDEX idx_role_permission_role ON role_permission (role_id);
CREATE INDEX idx_role_permission_permission ON role_permission (permission_id);

-- --------------------------------------------------------
-- Table: refresh_token
-- Refresh token storage for JWT renewal and logout
-- --------------------------------------------------------
CREATE TABLE refresh_token (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  device_info VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  CONSTRAINT fk_refresh_token_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_token_user_hash ON refresh_token (user_id, token_hash);
CREATE INDEX idx_refresh_token_expires ON refresh_token (expires_at);
CREATE INDEX idx_refresh_token_revoked ON refresh_token (revoked_at);

-- --------------------------------------------------------
-- Table: social_account
-- OAuth social login integration
-- --------------------------------------------------------
CREATE TABLE social_account (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  provider enum_social_provider NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255) DEFAULT NULL,
  access_token TEXT DEFAULT NULL,
  refresh_token TEXT DEFAULT NULL,
  token_expires_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_social_provider_user UNIQUE (provider, provider_user_id),

  CONSTRAINT fk_social_account_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_social_account_user ON social_account (user_id);
CREATE INDEX idx_social_account_provider ON social_account (provider);

-- =========================================================
-- Core tables created successfully
-- =========================================================
