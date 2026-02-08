-- =========================================================
-- Migration 003: Create Session & Invitation Tables
-- =========================================================
-- Core business logic: training sessions and invitations
-- =========================================================

USE beeactive;

-- --------------------------------------------------------
-- Table: session
-- Training sessions (classes, workshops, one-on-one)
-- --------------------------------------------------------
CREATE TABLE `session` (
  `id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) DEFAULT NULL COMMENT 'Optional organization context',
  `organizer_id` CHAR(36) NOT NULL COMMENT 'Trainer/instructor',
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `session_type` ENUM('ONE_ON_ONE', 'GROUP', 'ONLINE', 'WORKSHOP') NOT NULL,
  `visibility` ENUM('PRIVATE', 'MEMBERS', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
  `scheduled_at` DATETIME NOT NULL,
  `duration_minutes` INT NOT NULL,
  `location` VARCHAR(255) DEFAULT NULL COMMENT 'Physical or virtual location',
  `max_participants` INT DEFAULT NULL COMMENT 'NULL = unlimited',
  `price` DECIMAL(10,2) DEFAULT NULL COMMENT 'Session price',
  `currency` VARCHAR(3) NOT NULL DEFAULT 'RON',
  `status` ENUM('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `is_recurring` TINYINT(1) NOT NULL DEFAULT 0,
  `recurring_rule` JSON DEFAULT NULL COMMENT 'iCal RRULE format',
  `reminder_sent` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Email reminder sent flag',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Soft delete',

  PRIMARY KEY (`id`),
  KEY `idx_session_organizer` (`organizer_id`),
  KEY `idx_session_org` (`organization_id`),
  KEY `idx_session_scheduled` (`scheduled_at`),
  KEY `idx_session_visibility_scheduled` (`visibility`, `scheduled_at`),
  KEY `idx_session_status` (`status`),
  KEY `idx_session_reminder` (`reminder_sent`, `scheduled_at`),
  KEY `idx_session_deleted_at` (`deleted_at`),

  CONSTRAINT `fk_session_organizer` FOREIGN KEY (`organizer_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_org` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Training sessions';

-- --------------------------------------------------------
-- Table: session_participant
-- Users registered for sessions
-- --------------------------------------------------------
CREATE TABLE `session_participant` (
  `id` CHAR(36) NOT NULL,
  `session_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `status` ENUM('REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED') NOT NULL DEFAULT 'REGISTERED',
  `checked_in_at` DATETIME DEFAULT NULL COMMENT 'Check-in timestamp',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_participant` (`session_id`, `user_id`),
  KEY `idx_session_participant_session` (`session_id`),
  KEY `idx_session_participant_user` (`user_id`),
  KEY `idx_session_participant_status` (`status`),

  CONSTRAINT `fk_session_participant_session` FOREIGN KEY (`session_id`)
    REFERENCES `session` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_participant_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Session participant registrations';

-- --------------------------------------------------------
-- Table: invitation
-- User invitations to join organization or session
-- --------------------------------------------------------
CREATE TABLE `invitation` (
  `id` CHAR(36) NOT NULL,
  `inviter_id` CHAR(36) NOT NULL COMMENT 'User who sent invitation',
  `email` VARCHAR(255) NOT NULL COMMENT 'Invitee email address',
  `role_id` CHAR(36) NOT NULL COMMENT 'Role to assign upon acceptance',
  `organization_id` CHAR(36) DEFAULT NULL COMMENT 'Optional organization context',
  `token` VARCHAR(255) NOT NULL COMMENT 'Unique invitation token',
  `message` TEXT DEFAULT NULL COMMENT 'Personal message from inviter',
  `expires_at` DATETIME NOT NULL,
  `accepted_at` DATETIME DEFAULT NULL,
  `declined_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitation_token` (`token`),
  KEY `idx_invitation_email` (`email`),
  KEY `idx_invitation_token` (`token`),
  KEY `idx_invitation_expires` (`expires_at`),
  KEY `idx_invitation_status` (`accepted_at`, `declined_at`),
  KEY `idx_invitation_inviter` (`inviter_id`),
  KEY `idx_invitation_role` (`role_id`),
  KEY `idx_invitation_org` (`organization_id`),

  CONSTRAINT `fk_invitation_inviter` FOREIGN KEY (`inviter_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invitation_role` FOREIGN KEY (`role_id`)
    REFERENCES `role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invitation_org` FOREIGN KEY (`organization_id`)
    REFERENCES `organization` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User invitations';

-- =========================================================
-- Session tables created successfully
-- =========================================================
