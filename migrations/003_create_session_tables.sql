-- =========================================================
-- Migration 003: Create Session & Invitation Tables
-- =========================================================
-- Core business logic: training sessions and group invitations
-- =========================================================

-- --------------------------------------------------------
-- Enum types for sessions
-- --------------------------------------------------------
CREATE TYPE enum_session_type AS ENUM ('ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP');
CREATE TYPE enum_session_visibility AS ENUM ('PUBLIC', 'GROUP', 'CLIENTS', 'PRIVATE');
CREATE TYPE enum_session_status AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE enum_participant_status AS ENUM ('REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

-- --------------------------------------------------------
-- Table: session
-- Training sessions (classes, workshops, one-on-one)
-- --------------------------------------------------------
CREATE TABLE session (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) DEFAULT NULL,
  instructor_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  session_type enum_session_type NOT NULL,
  visibility enum_session_visibility NOT NULL DEFAULT 'PRIVATE',
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INT NOT NULL,
  location VARCHAR(255) DEFAULT NULL,
  max_participants INT DEFAULT NULL,
  price DECIMAL(10,2) DEFAULT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'RON',
  status enum_session_status NOT NULL DEFAULT 'SCHEDULED',
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_rule JSON DEFAULT NULL,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,

  PRIMARY KEY (id),

  CONSTRAINT fk_session_instructor FOREIGN KEY (instructor_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_session_group FOREIGN KEY (group_id)
    REFERENCES "group" (id) ON DELETE SET NULL
);

CREATE INDEX idx_session_instructor ON session (instructor_id);
CREATE INDEX idx_session_group ON session (group_id);
CREATE INDEX idx_session_scheduled ON session (scheduled_at);
CREATE INDEX idx_session_visibility_scheduled ON session (visibility, scheduled_at);
CREATE INDEX idx_session_status ON session (status);
CREATE INDEX idx_session_reminder ON session (reminder_sent, scheduled_at);
CREATE INDEX idx_session_deleted_at ON session (deleted_at);

-- --------------------------------------------------------
-- Table: session_participant
-- Users registered for sessions
-- --------------------------------------------------------
CREATE TABLE session_participant (
  id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status enum_participant_status NOT NULL DEFAULT 'REGISTERED',
  checked_in_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_session_participant UNIQUE (session_id, user_id),

  CONSTRAINT fk_session_participant_session FOREIGN KEY (session_id)
    REFERENCES session (id) ON DELETE CASCADE,
  CONSTRAINT fk_session_participant_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_session_participant_session ON session_participant (session_id);
CREATE INDEX idx_session_participant_user ON session_participant (user_id);
CREATE INDEX idx_session_participant_status ON session_participant (status);

-- --------------------------------------------------------
-- Table: invitation
-- Invitations to join groups
-- --------------------------------------------------------
CREATE TABLE invitation (
  id CHAR(36) NOT NULL,
  inviter_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role_id CHAR(36) NOT NULL,
  group_id CHAR(36) DEFAULT NULL,
  token VARCHAR(255) NOT NULL,
  message TEXT DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP DEFAULT NULL,
  declined_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_invitation_token UNIQUE (token),

  CONSTRAINT fk_invitation_inviter FOREIGN KEY (inviter_id)
    REFERENCES "user" (id) ON DELETE CASCADE,
  CONSTRAINT fk_invitation_role FOREIGN KEY (role_id)
    REFERENCES role (id) ON DELETE CASCADE,
  CONSTRAINT fk_invitation_group FOREIGN KEY (group_id)
    REFERENCES "group" (id) ON DELETE CASCADE
);

CREATE INDEX idx_invitation_email ON invitation (email);
CREATE INDEX idx_invitation_token ON invitation (token);
CREATE INDEX idx_invitation_expires ON invitation (expires_at);
CREATE INDEX idx_invitation_status ON invitation (accepted_at, declined_at);
CREATE INDEX idx_invitation_inviter ON invitation (inviter_id);
CREATE INDEX idx_invitation_role ON invitation (role_id);
CREATE INDEX idx_invitation_group ON invitation (group_id);

-- =========================================================
-- Session & invitation tables created successfully
-- =========================================================
