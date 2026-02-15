-- =========================================================
-- Migration 004: Create Profile Tables
-- =========================================================
-- Extended profiles for instructors and users
-- =========================================================

-- --------------------------------------------------------
-- Table: instructor_profile
-- Extended profile for instructors/trainers
-- --------------------------------------------------------
CREATE TABLE `instructor_profile` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `display_name` VARCHAR(100) DEFAULT NULL COMMENT 'Professional display name',
  `specializations` JSON DEFAULT NULL COMMENT 'Training specializations (e.g., ["yoga", "pilates"])',
  `bio` TEXT DEFAULT NULL COMMENT 'Professional biography',
  `certifications` JSON DEFAULT NULL COMMENT 'Professional certifications [{name, issuer, year}]',
  `years_of_experience` INT DEFAULT NULL,
  `is_accepting_clients` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Open for new clients',
  `social_links` JSON DEFAULT NULL COMMENT 'Social media profiles',
  `show_social_links` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Display social links publicly',
  `show_email` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Display email publicly',
  `show_phone` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Display phone publicly',
  `location_city` VARCHAR(100) DEFAULT NULL COMMENT 'City where instructor operates',
  `location_country` VARCHAR(5) DEFAULT NULL COMMENT 'Country code (e.g., RO, US)',
  `is_public` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Profile visible in public search',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_instructor_profile_user` (`user_id`),
  KEY `idx_instructor_profile_accepting` (`is_accepting_clients`),
  KEY `idx_instructor_profile_public` (`is_public`),

  CONSTRAINT `fk_instructor_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Extended profiles for instructors/trainers';

-- --------------------------------------------------------
-- Table: user_profile
-- Extended profile for users (health & fitness data)
-- --------------------------------------------------------
CREATE TABLE `user_profile` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `date_of_birth` DATE DEFAULT NULL,
  `gender` ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY') DEFAULT NULL COMMENT 'User gender',
  `height_cm` DECIMAL(5,1) DEFAULT NULL COMMENT 'Height in centimeters',
  `weight_kg` DECIMAL(5,1) DEFAULT NULL COMMENT 'Weight in kilograms',
  `fitness_level` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED') DEFAULT NULL,
  `goals` JSON DEFAULT NULL COMMENT 'Fitness goals (e.g., ["weight_loss", "strength"])',
  `medical_conditions` JSON DEFAULT NULL COMMENT 'Medical conditions/injuries as JSON array',
  `emergency_contact_name` VARCHAR(100) DEFAULT NULL,
  `emergency_contact_phone` VARCHAR(20) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL COMMENT 'Additional notes from the user',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_profile_user` (`user_id`),
  KEY `idx_user_profile_fitness_level` (`fitness_level`),

  CONSTRAINT `fk_user_profile_user` FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Extended profiles for users (health and fitness data)';

-- =========================================================
-- Profile tables created successfully
-- =========================================================
