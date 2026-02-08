-- =========================================================
-- Migration 008: Update Profile & Organization Member Tables
-- =========================================================
-- Adds missing fields for profiles and consent-based sharing
-- =========================================================

USE beeactive;

-- --------------------------------------------------------
-- Update: participant_profile - add gender, height, weight, notes
-- --------------------------------------------------------
ALTER TABLE `participant_profile`
  ADD COLUMN `gender` ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY') DEFAULT NULL
    COMMENT 'Participant gender' AFTER `date_of_birth`,
  ADD COLUMN `height_cm` DECIMAL(5,1) DEFAULT NULL
    COMMENT 'Height in centimeters' AFTER `gender`,
  ADD COLUMN `weight_kg` DECIMAL(5,1) DEFAULT NULL
    COMMENT 'Weight in kilograms' AFTER `height_cm`,
  ADD COLUMN `notes` TEXT DEFAULT NULL
    COMMENT 'Additional notes from the participant' AFTER `emergency_contact_phone`;

-- Change medical_conditions from TEXT to JSON for consistency with goals
ALTER TABLE `participant_profile`
  MODIFY COLUMN `medical_conditions` JSON DEFAULT NULL
    COMMENT 'Medical conditions/injuries as JSON array';

-- --------------------------------------------------------
-- Update: organizer_profile - add display_name, location, public flag
-- --------------------------------------------------------
ALTER TABLE `organizer_profile`
  ADD COLUMN `display_name` VARCHAR(100) DEFAULT NULL
    COMMENT 'Professional display name (e.g., "Coach John")' AFTER `user_id`,
  ADD COLUMN `location_city` VARCHAR(100) DEFAULT NULL
    COMMENT 'City where trainer operates' AFTER `show_phone`,
  ADD COLUMN `location_country` VARCHAR(5) DEFAULT NULL
    COMMENT 'Country code (e.g., RO, US)' AFTER `location_city`,
  ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Profile visible in public search (future discovery feature)' AFTER `location_country`;

-- --------------------------------------------------------
-- Update: organization_member - add consent-based data sharing
-- --------------------------------------------------------
ALTER TABLE `organization_member`
  ADD COLUMN `shared_health_info` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Participant consents to share health data with org trainer' AFTER `is_owner`,
  ADD COLUMN `nickname` VARCHAR(100) DEFAULT NULL
    COMMENT 'Optional nickname within this organization' AFTER `shared_health_info`;

-- =========================================================
-- Migration 008 completed successfully
-- =========================================================
