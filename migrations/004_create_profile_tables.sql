-- =========================================================
-- Migration 004: Create User Profile Tables
-- =========================================================
-- Extended profiles for trainers and participants
-- =========================================================

-- --------------------------------------------------------
-- Table: organizer_profile
-- Extended profile for trainers/instructors/organizers
-- --------------------------------------------------------
CREATE TABLE `organizer_profile` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `specializations` JSON DEFAULT NULL COMMENT 'Training specializations (e.g., ["yoga", "pilates"])',
  `bio` TEXT DEFAULT NULL COMMENT 'Professional biography',
  `certifications` JSON DEFAULT NULL COMMENT 'Professional certifications',
  `years_of_experience` INT DEFAULT NULL,
  `is_accepting_clients` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Open for new clients',
  `social_links` JSON DEFAULT NULL COMMENT 'Social media profiles',
  `show_social_links` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Display social links publicly',
  `show_email` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Display email publicly',
  `show_phone` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Display phone publicly',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_organizer_profile_user` (`user_id`),
  KEY `idx_organizer_profile_accepting` (`is_accepting_clients`),

  CONSTRAINT `fk_organizer_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Extended profiles for trainers/organizers';

-- --------------------------------------------------------
-- Table: participant_profile
-- Extended profile for participants/clients
-- --------------------------------------------------------
CREATE TABLE `participant_profile` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `date_of_birth` DATE DEFAULT NULL,
  `fitness_level` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED') DEFAULT NULL,
  `goals` JSON DEFAULT NULL COMMENT 'Fitness goals (e.g., ["weight_loss", "strength"])',
  `medical_conditions` TEXT DEFAULT NULL COMMENT 'Medical conditions/injuries',
  `emergency_contact_name` VARCHAR(100) DEFAULT NULL,
  `emergency_contact_phone` VARCHAR(20) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_participant_profile_user` (`user_id`),
  KEY `idx_participant_profile_fitness_level` (`fitness_level`),

  CONSTRAINT `fk_participant_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Extended profiles for participants/clients';

-- =========================================================
-- Profile tables created successfully
-- =========================================================
