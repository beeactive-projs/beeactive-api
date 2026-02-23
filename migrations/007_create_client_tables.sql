-- =========================================================
-- Migration 007: Create Instructor-Client Tables
-- =========================================================
-- Professional relationship between instructors and clients
-- Supports bidirectional requests (user→instructor, instructor→user)
-- =========================================================

-- --------------------------------------------------------
-- Enum types for client relationships
-- --------------------------------------------------------
CREATE TYPE enum_instructor_client_status AS ENUM ('PENDING', 'ACTIVE', 'ARCHIVED');
CREATE TYPE enum_initiated_by AS ENUM ('INSTRUCTOR', 'CLIENT');
CREATE TYPE enum_client_request_type AS ENUM ('CLIENT_TO_INSTRUCTOR', 'INSTRUCTOR_TO_CLIENT');
CREATE TYPE enum_client_request_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- --------------------------------------------------------
-- Table: instructor_client
-- Active instructor-client relationships
-- --------------------------------------------------------
CREATE TABLE instructor_client (
  id CHAR(36) NOT NULL,
  instructor_id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  status enum_instructor_client_status NOT NULL DEFAULT 'PENDING',
  initiated_by enum_initiated_by NOT NULL,
  notes TEXT DEFAULT NULL,
  started_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_instructor_client UNIQUE (instructor_id, client_id),

  CONSTRAINT fk_instructor_client_instructor FOREIGN KEY (instructor_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_instructor_client_client FOREIGN KEY (client_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_instructor_client_instructor ON instructor_client (instructor_id, status);
CREATE INDEX idx_instructor_client_client ON instructor_client (client_id, status);

-- --------------------------------------------------------
-- Table: client_request
-- Requests to establish instructor-client relationships
-- Can be initiated by either party
-- --------------------------------------------------------
CREATE TABLE client_request (
  id CHAR(36) NOT NULL,
  from_user_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  type enum_client_request_type NOT NULL,
  message TEXT DEFAULT NULL,
  status enum_client_request_status NOT NULL DEFAULT 'PENDING',
  token VARCHAR(255) DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  CONSTRAINT fk_client_request_from FOREIGN KEY (from_user_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_client_request_to FOREIGN KEY (to_user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_client_request_to ON client_request (to_user_id, status);
CREATE INDEX idx_client_request_from ON client_request (from_user_id, status);
CREATE INDEX idx_client_request_token ON client_request (token);
CREATE INDEX idx_client_request_expires ON client_request (expires_at);

-- =========================================================
-- Client tables created successfully
-- =========================================================
