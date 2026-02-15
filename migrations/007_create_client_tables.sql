-- =========================================================
-- Migration 007: Create Instructor-Client Tables
-- =========================================================
-- Professional relationship between instructors and clients
-- Supports bidirectional requests (user→instructor, instructor→user)
-- =========================================================

-- --------------------------------------------------------
-- Table: instructor_client
-- Active instructor-client relationships
-- --------------------------------------------------------
CREATE TABLE `instructor_client` (
  `id` CHAR(36) NOT NULL,
  `instructor_id` CHAR(36) NOT NULL COMMENT 'The instructor (must have INSTRUCTOR role)',
  `client_id` CHAR(36) NOT NULL COMMENT 'The client (any user)',
  `status` ENUM('PENDING', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'PENDING' COMMENT 'Relationship status',
  `initiated_by` ENUM('INSTRUCTOR', 'CLIENT') NOT NULL COMMENT 'Who initiated the relationship',
  `notes` TEXT DEFAULT NULL COMMENT 'Instructor private notes about this client',
  `started_at` DATETIME DEFAULT NULL COMMENT 'When status became ACTIVE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_instructor_client` (`instructor_id`, `client_id`),
  KEY `idx_instructor_client_instructor` (`instructor_id`, `status`),
  KEY `idx_instructor_client_client` (`client_id`, `status`),

  CONSTRAINT `fk_instructor_client_instructor` FOREIGN KEY (`instructor_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_instructor_client_client` FOREIGN KEY (`client_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Instructor-client professional relationships';

-- --------------------------------------------------------
-- Table: client_request
-- Requests to establish instructor-client relationships
-- Can be initiated by either party
-- --------------------------------------------------------
CREATE TABLE `client_request` (
  `id` CHAR(36) NOT NULL,
  `from_user_id` CHAR(36) NOT NULL COMMENT 'Who initiated the request',
  `to_user_id` CHAR(36) NOT NULL COMMENT 'Who receives the request',
  `type` ENUM('CLIENT_TO_INSTRUCTOR', 'INSTRUCTOR_TO_CLIENT') NOT NULL COMMENT 'Direction of request',
  `message` TEXT DEFAULT NULL COMMENT 'Optional personal message',
  `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `token` VARCHAR(255) DEFAULT NULL COMMENT 'Token for email-based acceptance',
  `expires_at` DATETIME NOT NULL COMMENT 'Request expiration',
  `responded_at` DATETIME DEFAULT NULL COMMENT 'When the request was responded to',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_client_request_to` (`to_user_id`, `status`),
  KEY `idx_client_request_from` (`from_user_id`, `status`),
  KEY `idx_client_request_token` (`token`),
  KEY `idx_client_request_expires` (`expires_at`),

  CONSTRAINT `fk_client_request_from` FOREIGN KEY (`from_user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_client_request_to` FOREIGN KEY (`to_user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Requests to establish instructor-client relationships';

-- =========================================================
-- Client tables created successfully
-- =========================================================
