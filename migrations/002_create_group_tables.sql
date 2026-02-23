-- =========================================================
-- Migration 002: Create Group Tables
-- =========================================================
-- Groups (formerly organizations) for instructors to manage
-- their communities, classes, and members
-- =========================================================

-- --------------------------------------------------------
-- Table: group
-- Instructor-owned groups (fitness classes, teams, communities)
-- Note: "group" is a reserved word in PostgreSQL, so we quote it
-- --------------------------------------------------------
CREATE TABLE "group" (
  id CHAR(36) NOT NULL,
  instructor_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',
  settings JSON DEFAULT NULL,

  -- Status & visibility
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  join_policy VARCHAR(20) NOT NULL DEFAULT 'INVITE_ONLY',
  tags JSON DEFAULT NULL,

  -- Contact & location
  contact_email VARCHAR(255) DEFAULT NULL,
  contact_phone VARCHAR(20) DEFAULT NULL,
  address VARCHAR(500) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  country VARCHAR(5) DEFAULT NULL,

  -- Denormalized count
  member_count INTEGER NOT NULL DEFAULT 0,

  -- Join link
  join_token VARCHAR(64) DEFAULT NULL,
  join_token_expires_at TIMESTAMP DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT uk_group_slug UNIQUE (slug),

  CONSTRAINT fk_group_instructor FOREIGN KEY (instructor_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_group_slug ON "group" (slug);
CREATE INDEX idx_group_active ON "group" (is_active);
CREATE INDEX idx_group_deleted_at ON "group" (deleted_at);
CREATE INDEX idx_group_instructor ON "group" (instructor_id);
CREATE INDEX idx_group_discovery ON "group" (is_public, is_active, city);
CREATE INDEX idx_group_join_token ON "group" (join_token);

-- --------------------------------------------------------
-- Table: group_member
-- Users belonging to groups
-- --------------------------------------------------------
CREATE TABLE group_member (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  shared_health_info BOOLEAN NOT NULL DEFAULT FALSE,
  nickname VARCHAR(100) DEFAULT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT uk_group_member UNIQUE (group_id, user_id),

  CONSTRAINT fk_group_member_group FOREIGN KEY (group_id)
    REFERENCES "group" (id) ON DELETE CASCADE,
  CONSTRAINT fk_group_member_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_group_member_group ON group_member (group_id);
CREATE INDEX idx_group_member_user ON group_member (user_id);
CREATE INDEX idx_group_member_owner ON group_member (group_id, is_owner);

-- --------------------------------------------------------
-- Add group FK to user_role (now that group table exists)
-- --------------------------------------------------------
ALTER TABLE user_role
  ADD CONSTRAINT fk_user_role_group FOREIGN KEY (group_id)
    REFERENCES "group" (id) ON DELETE CASCADE;

-- =========================================================
-- Group tables created successfully
-- =========================================================
