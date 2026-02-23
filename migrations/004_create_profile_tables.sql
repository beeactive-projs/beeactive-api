-- =========================================================
-- Migration 004: Create Profile Tables
-- =========================================================
-- Extended profiles for instructors and users
-- =========================================================

-- --------------------------------------------------------
-- Enum types for profiles
-- --------------------------------------------------------
CREATE TYPE enum_gender AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
CREATE TYPE enum_fitness_level AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- --------------------------------------------------------
-- Table: instructor_profile
-- Extended profile for instructors/trainers
-- --------------------------------------------------------
CREATE TABLE instructor_profile (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  display_name VARCHAR(100) DEFAULT NULL,
  specializations JSON DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  certifications JSON DEFAULT NULL,
  years_of_experience INT DEFAULT NULL,
  is_accepting_clients BOOLEAN NOT NULL DEFAULT TRUE,
  social_links JSON DEFAULT NULL,
  show_social_links BOOLEAN NOT NULL DEFAULT TRUE,
  show_email BOOLEAN NOT NULL DEFAULT TRUE,
  show_phone BOOLEAN NOT NULL DEFAULT FALSE,
  location_city VARCHAR(100) DEFAULT NULL,
  location_country VARCHAR(5) DEFAULT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_instructor_profile_user UNIQUE (user_id),

  CONSTRAINT fk_instructor_profile_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_instructor_profile_accepting ON instructor_profile (is_accepting_clients);
CREATE INDEX idx_instructor_profile_public ON instructor_profile (is_public);

-- --------------------------------------------------------
-- Table: user_profile
-- Extended profile for users (health & fitness data)
-- --------------------------------------------------------
CREATE TABLE user_profile (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  date_of_birth DATE DEFAULT NULL,
  gender enum_gender DEFAULT NULL,
  height_cm DECIMAL(5,1) DEFAULT NULL,
  weight_kg DECIMAL(5,1) DEFAULT NULL,
  fitness_level enum_fitness_level DEFAULT NULL,
  goals JSON DEFAULT NULL,
  medical_conditions JSON DEFAULT NULL,
  emergency_contact_name VARCHAR(100) DEFAULT NULL,
  emergency_contact_phone VARCHAR(20) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT uk_user_profile_user UNIQUE (user_id),

  CONSTRAINT fk_user_profile_user FOREIGN KEY (user_id)
    REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX idx_user_profile_fitness_level ON user_profile (fitness_level);

-- =========================================================
-- Profile tables created successfully
-- =========================================================
