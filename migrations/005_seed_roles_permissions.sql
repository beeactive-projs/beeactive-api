-- =========================================================
-- Migration 005: Seed Roles & Permissions
-- =========================================================
-- Initial RBAC data with comprehensive permissions
-- =========================================================

USE beeactive;

-- --------------------------------------------------------
-- Insert Roles
-- --------------------------------------------------------
INSERT INTO `role` (`id`, `name`, `display_name`, `description`, `level`, `is_system_role`, `created_at`, `updated_at`) VALUES
('7261bd94-006c-11f1-b74f-0242ac110002', 'SUPER_ADMIN', 'Super Administrator', 'Full platform access - platform owner', 1, 1, NOW(), NOW()),
('7261d03c-006c-11f1-b74f-0242ac110002', 'ADMIN', 'Administrator', 'Platform administration and user management', 2, 1, NOW(), NOW()),
('7261d117-006c-11f1-b74f-0242ac110002', 'SUPPORT', 'Support Agent', 'Customer support - read-only access to help users', 3, 1, NOW(), NOW()),
('7261d176-006c-11f1-b74f-0242ac110002', 'ORGANIZER', 'Organizer', 'Can create and manage sessions, invite participants', 5, 1, NOW(), NOW()),
('7261d1cc-006c-11f1-b74f-0242ac110002', 'PARTICIPANT', 'Participant', 'Can join sessions and manage own profile', 10, 1, NOW(), NOW());

-- --------------------------------------------------------
-- Insert Permissions
-- --------------------------------------------------------

-- User Permissions
INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('726532a8-006c-11f1-b74f-0242ac110002', 'user.create', 'Create Users', 'Can create new user accounts', 'user', 'create', NOW()),
('72653a6a-006c-11f1-b74f-0242ac110002', 'user.read', 'View Users', 'Can view user information', 'user', 'read', NOW()),
('72653bcc-006c-11f1-b74f-0242ac110002', 'user.update', 'Update Users', 'Can update user information', 'user', 'update', NOW()),
('72653c45-006c-11f1-b74f-0242ac110002', 'user.delete', 'Delete Users', 'Can delete user accounts', 'user', 'delete', NOW());

-- Session Permissions
INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('72653cb1-006c-11f1-b74f-0242ac110002', 'session.create', 'Create Sessions', 'Can create new sessions', 'session', 'create', NOW()),
('72653d13-006c-11f1-b74f-0242ac110002', 'session.read', 'View Sessions', 'Can view session details', 'session', 'read', NOW()),
('72653d7a-006c-11f1-b74f-0242ac110002', 'session.update', 'Update Sessions', 'Can modify sessions', 'session', 'update', NOW()),
('72653de0-006c-11f1-b74f-0242ac110002', 'session.delete', 'Delete Sessions', 'Can cancel/delete sessions', 'session', 'delete', NOW()),
('72653e49-006c-11f1-b74f-0242ac110002', 'session.manage', 'Manage All Sessions', 'Full session management across all users', 'session', 'manage', NOW());

-- Organization Permissions
INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('72653ef6-006c-11f1-b74f-0242ac110002', 'organization.create', 'Create Organizations', 'Can create organizations', 'organization', 'create', NOW()),
('72653f64-006c-11f1-b74f-0242ac110002', 'organization.read', 'View Organizations', 'Can view organization details', 'organization', 'read', NOW()),
('72653fca-006c-11f1-b74f-0242ac110002', 'organization.update', 'Update Organizations', 'Can modify organizations', 'organization', 'update', NOW()),
('7265402f-006c-11f1-b74f-0242ac110002', 'organization.delete', 'Delete Organizations', 'Can delete organizations', 'organization', 'delete', NOW());

-- Invitation Permissions
INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('726540a4-006c-11f1-b74f-0242ac110002', 'invitation.send', 'Send Invitations', 'Can send invitations', 'invitation', 'create', NOW()),
('72654114-006c-11f1-b74f-0242ac110002', 'invitation.manage', 'Manage Invitations', 'Full invitation management', 'invitation', 'manage', NOW());

-- Feature & Subscription Permissions
INSERT INTO `permission` (`id`, `name`, `display_name`, `description`, `resource`, `action`, `created_at`) VALUES
('72654177-006c-11f1-b74f-0242ac110002', 'feature.manage', 'Manage Features', 'Can manage feature flags', 'feature', 'manage', NOW()),
('726541d7-006c-11f1-b74f-0242ac110002', 'subscription.read', 'View Subscriptions', 'Can view subscription info', 'subscription', 'read', NOW()),
('72654260-006c-11f1-b74f-0242ac110002', 'subscription.manage', 'Manage Subscriptions', 'Full subscription management', 'subscription', 'manage', NOW());

-- --------------------------------------------------------
-- Assign Permissions to SUPER_ADMIN (All Permissions)
-- --------------------------------------------------------
INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`)
SELECT UUID(), '7261bd94-006c-11f1-b74f-0242ac110002', `id`, NOW()
FROM `permission`;

-- --------------------------------------------------------
-- Assign Permissions to ADMIN
-- --------------------------------------------------------
INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`) VALUES
-- User management
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', NOW()), -- user.read
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653bcc-006c-11f1-b74f-0242ac110002', NOW()), -- user.update

-- Session management
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653e49-006c-11f1-b74f-0242ac110002', NOW()), -- session.manage

-- Organization management
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()), -- organization.read
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72653fca-006c-11f1-b74f-0242ac110002', NOW()), -- organization.update

-- Invitation management
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '72654114-006c-11f1-b74f-0242ac110002', NOW()), -- invitation.manage

-- Subscription viewing
(UUID(), '7261d03c-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', NOW()); -- subscription.read

-- --------------------------------------------------------
-- Assign Permissions to SUPPORT
-- --------------------------------------------------------
INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`) VALUES
-- Read-only access
(UUID(), '7261d117-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', NOW()), -- user.read
(UUID(), '7261d117-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(UUID(), '7261d117-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()), -- organization.read
(UUID(), '7261d117-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', NOW()); -- subscription.read

-- --------------------------------------------------------
-- Assign Permissions to ORGANIZER
-- --------------------------------------------------------
INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`) VALUES
-- Session management (own sessions)
(UUID(), '7261d176-006c-11f1-b74f-0242ac110002', '72653cb1-006c-11f1-b74f-0242ac110002', NOW()), -- session.create
(UUID(), '7261d176-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(UUID(), '7261d176-006c-11f1-b74f-0242ac110002', '72653d7a-006c-11f1-b74f-0242ac110002', NOW()), -- session.update
(UUID(), '7261d176-006c-11f1-b74f-0242ac110002', '72653de0-006c-11f1-b74f-0242ac110002', NOW()), -- session.delete

-- Invitation sending
(UUID(), '7261d176-006c-11f1-b74f-0242ac110002', '726540a4-006c-11f1-b74f-0242ac110002', NOW()); -- invitation.send

-- --------------------------------------------------------
-- Assign Permissions to PARTICIPANT
-- --------------------------------------------------------
INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `created_at`) VALUES
-- Session viewing (join sessions)
(UUID(), '7261d1cc-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()); -- session.read

-- =========================================================
-- Roles and permissions seeded successfully
-- =========================================================
