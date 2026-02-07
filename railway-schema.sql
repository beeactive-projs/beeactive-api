-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: db:3306
-- Generation Time: Feb 07, 2026 at 01:32 PM
-- Server version: 8.3.0
-- PHP Version: 8.2.8
USE railway;

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `beeactive`
--

-- --------------------------------------------------------

--
-- Table structure for table `feature_flag`
--

CREATE TABLE `feature_flag` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `required_plans` json DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `feature_flag`
--

INSERT INTO `feature_flag` (`id`, `key`, `name`, `description`, `enabled`, `required_plans`, `metadata`, `created_at`, `updated_at`) VALUES
('72731ce9-006c-11f1-b74f-0242ac110002', 'advanced_analytics', 'Advanced Analytics', 'Detailed reports and insights', 1, '[\"pro\", \"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72732601-006c-11f1-b74f-0242ac110002', 'custom_branding', 'Custom Branding', 'Use your own logo and colors', 1, '[\"pro\", \"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72732711-006c-11f1-b74f-0242ac110002', 'recurring_sessions', 'Recurring Sessions', 'Create sessions that repeat automatically', 1, '[\"pro\", \"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72732798-006c-11f1-b74f-0242ac110002', 'api_access', 'API Access', 'Programmatic access to your data', 1, '[\"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7273280c-006c-11f1-b74f-0242ac110002', 'white_label', 'White Label', 'Remove BeeActive branding', 1, '[\"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7273287a-006c-11f1-b74f-0242ac110002', 'payment_processing', 'Payment Processing', 'Accept payments from participants', 0, '[\"pro\", \"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72732f45-006c-11f1-b74f-0242ac110002', 'sms_notifications', 'SMS Notifications', 'Send SMS reminders to participants', 0, '[\"pro\", \"enterprise\"]', NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `invitation`
--

CREATE TABLE `invitation` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inviter_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `expires_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `declined_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organization`
--

CREATE TABLE `organization` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Europe/Bucharest',
  `settings` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organization_member`
--

CREATE TABLE `organization_member` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_owner` tinyint(1) NOT NULL DEFAULT '0',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organization_subscription`
--

CREATE TABLE `organization_subscription` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('TRIALING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `current_period_start` datetime NOT NULL,
  `current_period_end` datetime NOT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `stripe_subscription_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_customer_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organizer_profile`
--

CREATE TABLE `organizer_profile` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `specializations` json DEFAULT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `certifications` json DEFAULT NULL,
  `years_of_experience` int DEFAULT NULL,
  `is_accepting_clients` tinyint(1) NOT NULL DEFAULT '1',
  `social_links` json DEFAULT NULL,
  `show_social_links` tinyint(1) NOT NULL DEFAULT '1',
  `show_email` tinyint(1) NOT NULL DEFAULT '1',
  `show_phone` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `participant_profile`
--

CREATE TABLE `participant_profile` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `fitness_level` enum('BEGINNER','INTERMEDIATE','ADVANCED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `goals` json DEFAULT NULL,
  `medical_conditions` text COLLATE utf8mb4_unicode_ci,
  `emergency_contact_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permission`
--

CREATE TABLE `permission` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `resource` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `permission`
--

INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('726532a8-006c-11f1-b74f-0242ac110002', 'user.create', 'Create Users', 'Can create new user accounts', 'user', 'create', '2026-02-02 19:22:00'),
('72653a6a-006c-11f1-b74f-0242ac110002', 'user.read', 'View Users', 'Can view user information', 'user', 'read', '2026-02-02 19:22:00'),
('72653bcc-006c-11f1-b74f-0242ac110002', 'user.update', 'Update Users', 'Can update user information', 'user', 'update', '2026-02-02 19:22:00'),
('72653c45-006c-11f1-b74f-0242ac110002', 'user.delete', 'Delete Users', 'Can delete user accounts', 'user', 'delete', '2026-02-02 19:22:00'),
('72653cb1-006c-11f1-b74f-0242ac110002', 'session.create', 'Create Sessions', 'Can create new sessions', 'session', 'create', '2026-02-02 19:22:00'),
('72653d13-006c-11f1-b74f-0242ac110002', 'session.read', 'View Sessions', 'Can view session details', 'session', 'read', '2026-02-02 19:22:00'),
('72653d7a-006c-11f1-b74f-0242ac110002', 'session.update', 'Update Sessions', 'Can modify sessions', 'session', 'update', '2026-02-02 19:22:00'),
('72653de0-006c-11f1-b74f-0242ac110002', 'session.delete', 'Delete Sessions', 'Can cancel/delete sessions', 'session', 'delete', '2026-02-02 19:22:00'),
('72653e49-006c-11f1-b74f-0242ac110002', 'session.manage', 'Manage All Sessions', 'Full session management', 'session', 'manage', '2026-02-02 19:22:00'),
('72653ef6-006c-11f1-b74f-0242ac110002', 'organization.create', 'Create Organizations', 'Can create organizations', 'organization', 'create', '2026-02-02 19:22:00'),
('72653f64-006c-11f1-b74f-0242ac110002', 'organization.read', 'View Organizations', 'Can view organization details', 'organization', 'read', '2026-02-02 19:22:00'),
('72653fca-006c-11f1-b74f-0242ac110002', 'organization.update', 'Update Organizations', 'Can modify organizations', 'organization', 'update', '2026-02-02 19:22:00'),
('7265402f-006c-11f1-b74f-0242ac110002', 'organization.delete', 'Delete Organizations', 'Can delete organizations', 'organization', 'delete', '2026-02-02 19:22:00'),
('726540a4-006c-11f1-b74f-0242ac110002', 'invitation.send', 'Send Invitations', 'Can send invitations', 'invitation', 'create', '2026-02-02 19:22:00'),
('72654114-006c-11f1-b74f-0242ac110002', 'invitation.manage', 'Manage Invitations', 'Full invitation management', 'invitation', 'manage', '2026-02-02 19:22:00'),
('72654177-006c-11f1-b74f-0242ac110002', 'feature.manage', 'Manage Features', 'Can manage feature flags', 'feature', 'manage', '2026-02-02 19:22:00'),
('726541d7-006c-11f1-b74f-0242ac110002', 'subscription.read', 'View Subscriptions', 'Can view subscription info', 'subscription', 'read', '2026-02-02 19:22:00'),
('72654260-006c-11f1-b74f-0242ac110002', 'subscription.manage', 'Manage Subscriptions', 'Full subscription management', 'subscription', 'manage', '2026-02-02 19:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `refresh_token`
--

CREATE TABLE `refresh_token` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_info` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role`
--

CREATE TABLE `role` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `level` int NOT NULL DEFAULT '10',
  `is_system_role` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `role`
--

INSERT INTO `role` (`id`, `name`, `display_name`, `description`, `level`, `is_system_role`, `created_at`, `updated_at`) VALUES
('7261bd94-006c-11f1-b74f-0242ac110002', 'SUPER_ADMIN', 'Super Administrator', 'Full platform access - platform owner', 1, 1, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7261d03c-006c-11f1-b74f-0242ac110002', 'ADMIN', 'Administrator', 'Platform administration and user management', 2, 1, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7261d117-006c-11f1-b74f-0242ac110002', 'SUPPORT', 'Support Agent', 'Customer support - read-only access to help users', 3, 1, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7261d176-006c-11f1-b74f-0242ac110002', 'ORGANIZER', 'Organizer', 'Can create and manage sessions, invite participants', 5, 1, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('7261d1cc-006c-11f1-b74f-0242ac110002', 'PARTICIPANT', 'Participant', 'Can join sessions and manage own profile', 10, 1, '2026-02-02 19:22:00', '2026-02-02 19:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `role_permission`
--

CREATE TABLE `role_permission` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `role_permission`
--

INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`) VALUES
('7267f263-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72654177-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f476-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '726540a4-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f56c-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72654114-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f5fc-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653ef6-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f6c9-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f78f-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653fca-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f814-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '7265402f-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f887-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653cb1-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267f903-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fa46-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653d7a-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267facf-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653de0-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fb46-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653e49-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fbe8-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fc95-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72654260-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fd3a-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '726532a8-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fdc8-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fe4e-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653bcc-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7267fee3-006c-11f1-b74f-0242ac110002', '7261bd94-006c-11f1-b74f-0242ac110002', '72653c45-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269e3df-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72654114-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269ef91-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f05a-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653fca-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f0fa-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653e49-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f17a-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f1f6-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f27b-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('7269f2f7-006c-11f1-b74f-0242ac110002', '7261d03c-006c-11f1-b74f-0242ac110002', '72653bcc-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726b7e54-006c-11f1-b74f-0242ac110002', '7261d117-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726b87a5-006c-11f1-b74f-0242ac110002', '7261d117-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726b884a-006c-11f1-b74f-0242ac110002', '7261d117-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726b88d7-006c-11f1-b74f-0242ac110002', '7261d117-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726cf955-006c-11f1-b74f-0242ac110002', '7261d176-006c-11f1-b74f-0242ac110002', '726540a4-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726d00b3-006c-11f1-b74f-0242ac110002', '7261d176-006c-11f1-b74f-0242ac110002', '72653cb1-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726d0154-006c-11f1-b74f-0242ac110002', '7261d176-006c-11f1-b74f-0242ac110002', '72653de0-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726d01dd-006c-11f1-b74f-0242ac110002', '7261d176-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726d026d-006c-11f1-b74f-0242ac110002', '7261d176-006c-11f1-b74f-0242ac110002', '72653d7a-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00'),
('726e6a44-006c-11f1-b74f-0242ac110002', '7261d1cc-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', '2026-02-02 19:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `session`
--

CREATE TABLE `session` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `organizer_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `session_type` enum('ONE_ON_ONE','GROUP','ONLINE','WORKSHOP') COLLATE utf8mb4_unicode_ci NOT NULL,
  `visibility` enum('PRIVATE','MEMBERS','PUBLIC') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PRIVATE',
  `scheduled_at` datetime NOT NULL,
  `duration_minutes` int NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_participants` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RON',
  `status` enum('DRAFT','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `is_recurring` tinyint(1) NOT NULL DEFAULT '0',
  `recurring_rule` json DEFAULT NULL,
  `reminder_sent` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `session_participant`
--

CREATE TABLE `session_participant` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('REGISTERED','CONFIRMED','ATTENDED','NO_SHOW','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'REGISTERED',
  `checked_in_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `social_account`
--

CREATE TABLE `social_account` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` enum('GOOGLE','FACEBOOK','APPLE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `access_token` text COLLATE utf8mb4_unicode_ci,
  `refresh_token` text COLLATE utf8mb4_unicode_ci,
  `token_expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `subscription_plan`
--

CREATE TABLE `subscription_plan` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RON',
  `billing_period` enum('MONTHLY','YEARLY','LIFETIME') COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_clients` int DEFAULT NULL,
  `max_sessions` int DEFAULT NULL,
  `features` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '0',
  `stripe_price_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `subscription_plan`
--

INSERT INTO `subscription_plan` (`id`, `name`, `slug`, `description`, `price`, `currency`, `billing_period`, `max_clients`, `max_sessions`, `features`, `is_active`, `display_order`, `stripe_price_id`, `created_at`, `updated_at`) VALUES
('7271272b-006c-11f1-b74f-0242ac110002', 'Free', 'free', 'Perfect for getting started', 0.00, 'RON', 'MONTHLY', 5, 20, '[\"basic_scheduling\", \"participant_management\"]', 1, 1, NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72713eb3-006c-11f1-b74f-0242ac110002', 'Pro', 'pro', 'Everything you need to grow your business', 99.00, 'RON', 'MONTHLY', 50, NULL, '[\"basic_scheduling\", \"participant_management\", \"advanced_analytics\", \"custom_branding\", \"priority_support\", \"recurring_sessions\"]', 1, 2, NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00'),
('72713fb7-006c-11f1-b74f-0242ac110002', 'Enterprise', 'enterprise', 'For large organizations and teams', 299.00, 'RON', 'MONTHLY', NULL, NULL, '[\"basic_scheduling\", \"participant_management\", \"advanced_analytics\", \"custom_branding\", \"priority_support\", \"recurring_sessions\", \"api_access\", \"white_label\", \"dedicated_support\"]', 1, 3, NULL, '2026-02-02 19:22:00', '2026-02-02 19:22:00');

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_id` tinyint UNSIGNED DEFAULT '1',
  `language` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en',
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Europe/Bucharest',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `email_verification_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_reset_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `avatar_id`, `language`, `timezone`, `is_active`, `is_email_verified`, `email_verification_token`, `password_reset_token`, `password_reset_expires`, `last_login_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
('b58124ce-e6ec-4951-8438-c89b43ace626', 'ionut@test.com', '$2b$10$BZphGFBgLfzeetj8wTReH.D5p.yx50ChxPzdX4F0r2yOqf7KSzD5e', 'Ionut', 'Butnaru', '0740123456', 1, 'en', 'Europe/Bucharest', 1, 0, NULL, NULL, NULL, NULL, '2026-02-03 11:33:06', '2026-02-03 11:33:06', NULL),
('c1e9d611-1bef-4529-9f6f-0bf77791d858', 'ionuWt@test.com', NULL, 'Ionut', 'Butnaru', '0740123456', 1, 'en', 'Europe/Bucharest', 1, 0, NULL, NULL, NULL, NULL, '2026-02-03 20:03:26', '2026-02-03 20:03:26', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user_role`
--

CREATE TABLE `user_role` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `user_role`
--

INSERT INTO `user_role` (`id`, `user_id`, `role_id`, `organization_id`, `assigned_at`, `expires_at`) VALUES
('7ec04b3b-d600-4684-98a1-1e4eb9dcd3c0', 'c1e9d611-1bef-4529-9f6f-0bf77791d858', '7261d1cc-006c-11f1-b74f-0242ac110002', NULL, '2026-02-03 20:03:26', NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `feature_flag`
--
ALTER TABLE `feature_flag`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `key` (`key`),
  ADD KEY `idx_feature_flag_key` (`key`),
  ADD KEY `idx_feature_flag_enabled` (`enabled`);

--
-- Indexes for table `invitation`
--
ALTER TABLE `invitation`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `idx_invitation_email` (`email`),
  ADD KEY `idx_invitation_token` (`token`),
  ADD KEY `idx_invitation_expires` (`expires_at`),
  ADD KEY `fk_invitation_inviter` (`inviter_id`),
  ADD KEY `fk_invitation_role` (`role_id`),
  ADD KEY `fk_invitation_org` (`organization_id`);

--
-- Indexes for table `organization`
--
ALTER TABLE `organization`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `slug` (`slug`),
  ADD KEY `idx_organization_slug` (`slug`),
  ADD KEY `idx_organization_deleted_at` (`deleted_at`);

--
-- Indexes for table `organization_member`
--
ALTER TABLE `organization_member`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_org_member` (`organization_id`,`user_id`),
  ADD KEY `idx_org_member_org` (`organization_id`),
  ADD KEY `idx_org_member_user` (`user_id`);

--
-- Indexes for table `organization_subscription`
--
ALTER TABLE `organization_subscription`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `organization_id` (`organization_id`),
  ADD KEY `idx_org_subscription_status` (`status`),
  ADD KEY `idx_org_subscription_period_end` (`current_period_end`),
  ADD KEY `fk_org_subscription_plan` (`plan_id`);

--
-- Indexes for table `organizer_profile`
--
ALTER TABLE `organizer_profile`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `participant_profile`
--
ALTER TABLE `participant_profile`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `permission`
--
ALTER TABLE `permission`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `idx_permission_resource` (`resource`),
  ADD KEY `idx_permission_name` (`name`);

--
-- Indexes for table `refresh_token`
--
ALTER TABLE `refresh_token`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_refresh_token_user` (`user_id`,`token_hash`),
  ADD KEY `idx_refresh_token_expires` (`expires_at`);

--
-- Indexes for table `role`
--
ALTER TABLE `role`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD KEY `idx_role_name` (`name`),
  ADD KEY `idx_role_level` (`level`);

--
-- Indexes for table `role_permission`
--
ALTER TABLE `role_permission`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_role_permission` (`role_id`,`permission_id`),
  ADD KEY `fk_role_permission_permission` (`permission_id`);

--
-- Indexes for table `session`
--
ALTER TABLE `session`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_session_organizer` (`organizer_id`),
  ADD KEY `idx_session_scheduled` (`scheduled_at`),
  ADD KEY `idx_session_visibility` (`visibility`,`scheduled_at`),
  ADD KEY `idx_session_status` (`status`),
  ADD KEY `idx_session_reminder` (`reminder_sent`,`scheduled_at`),
  ADD KEY `fk_session_org` (`organization_id`);

--
-- Indexes for table `session_participant`
--
ALTER TABLE `session_participant`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_session_participant` (`session_id`,`user_id`),
  ADD KEY `idx_session_participant_session` (`session_id`),
  ADD KEY `idx_session_participant_user` (`user_id`);

--
-- Indexes for table `social_account`
--
ALTER TABLE `social_account`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_provider_user` (`provider`,`provider_user_id`),
  ADD KEY `fk_social_account_user` (`user_id`);

--
-- Indexes for table `subscription_plan`
--
ALTER TABLE `subscription_plan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `slug` (`slug`),
  ADD KEY `idx_subscription_plan_slug` (`slug`),
  ADD KEY `idx_subscription_plan_active` (`is_active`,`display_order`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_user_email` (`email`),
  ADD KEY `idx_user_deleted_at` (`deleted_at`);

--
-- Indexes for table `user_role`
--
ALTER TABLE `user_role`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_user_role_org` (`user_id`,`role_id`,`organization_id`),
  ADD KEY `idx_user_role_user` (`user_id`),
  ADD KEY `fk_user_role_role` (`role_id`),
  ADD KEY `fk_user_role_org` (`organization_id`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `invitation`
--
ALTER TABLE `invitation`
  ADD CONSTRAINT `fk_invitation_inviter` FOREIGN KEY (`inviter_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_invitation_org` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_invitation_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `organization_member`
--
ALTER TABLE `organization_member`
  ADD CONSTRAINT `fk_org_member_org` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_org_member_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `organization_subscription`
--
ALTER TABLE `organization_subscription`
  ADD CONSTRAINT `fk_org_subscription_org` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_org_subscription_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`) ON DELETE RESTRICT;

--
-- Constraints for table `organizer_profile`
--
ALTER TABLE `organizer_profile`
  ADD CONSTRAINT `fk_organizer_profile_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `participant_profile`
--
ALTER TABLE `participant_profile`
  ADD CONSTRAINT `fk_participant_profile_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `refresh_token`
--
ALTER TABLE `refresh_token`
  ADD CONSTRAINT `fk_refresh_token_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `role_permission`
--
ALTER TABLE `role_permission`
  ADD CONSTRAINT `fk_role_permission_permission` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_role_permission_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `session`
--
ALTER TABLE `session`
  ADD CONSTRAINT `fk_session_org` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_session_organizer` FOREIGN KEY (`organizer_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `session_participant`
--
ALTER TABLE `session_participant`
  ADD CONSTRAINT `fk_session_participant_session` FOREIGN KEY (`session_id`) REFERENCES `session` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_session_participant_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `social_account`
--
ALTER TABLE `social_account`
  ADD CONSTRAINT `fk_social_account_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_role`
--
ALTER TABLE `user_role`
  ADD CONSTRAINT `fk_user_role_org` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_role_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_role_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
