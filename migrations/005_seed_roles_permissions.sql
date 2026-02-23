-- =========================================================
-- Migration 005: Seed Roles & Permissions
-- =========================================================
-- Initial RBAC data with comprehensive permissions
-- =========================================================

-- --------------------------------------------------------
-- Insert Roles
-- --------------------------------------------------------
INSERT INTO role (id, name, display_name, description, level, is_system_role, created_at, updated_at) VALUES
('7261bd94-006c-11f1-b74f-0242ac110002', 'SUPER_ADMIN', 'Super Administrator', 'Full platform access - platform owner', 1, TRUE, NOW(), NOW()),
('7261d03c-006c-11f1-b74f-0242ac110002', 'ADMIN', 'Administrator', 'Platform administration and user management', 2, TRUE, NOW(), NOW()),
('7261d117-006c-11f1-b74f-0242ac110002', 'SUPPORT', 'Support Agent', 'Customer support - read-only access to help users', 3, TRUE, NOW(), NOW()),
('7261d176-006c-11f1-b74f-0242ac110002', 'INSTRUCTOR', 'Instructor', 'Can create and manage sessions, groups, and clients', 5, TRUE, NOW(), NOW()),
('7261d1cc-006c-11f1-b74f-0242ac110002', 'USER', 'User', 'Can join sessions, groups, and manage own profile', 10, TRUE, NOW(), NOW());

-- --------------------------------------------------------
-- Insert Permissions
-- --------------------------------------------------------

-- User Permissions
INSERT INTO permission (id, name, display_name, description, resource, action, created_at) VALUES
('726532a8-006c-11f1-b74f-0242ac110002', 'user.create', 'Create Users', 'Can create new user accounts', 'user', 'create', NOW()),
('72653a6a-006c-11f1-b74f-0242ac110002', 'user.read', 'View Users', 'Can view user information', 'user', 'read', NOW()),
('72653bcc-006c-11f1-b74f-0242ac110002', 'user.update', 'Update Users', 'Can update user information', 'user', 'update', NOW()),
('72653c45-006c-11f1-b74f-0242ac110002', 'user.delete', 'Delete Users', 'Can delete user accounts', 'user', 'delete', NOW());

-- Session Permissions
INSERT INTO permission (id, name, display_name, description, resource, action, created_at) VALUES
('72653cb1-006c-11f1-b74f-0242ac110002', 'session.create', 'Create Sessions', 'Can create new sessions', 'session', 'create', NOW()),
('72653d13-006c-11f1-b74f-0242ac110002', 'session.read', 'View Sessions', 'Can view session details', 'session', 'read', NOW()),
('72653d7a-006c-11f1-b74f-0242ac110002', 'session.update', 'Update Sessions', 'Can modify sessions', 'session', 'update', NOW()),
('72653de0-006c-11f1-b74f-0242ac110002', 'session.delete', 'Delete Sessions', 'Can cancel/delete sessions', 'session', 'delete', NOW()),
('72653e49-006c-11f1-b74f-0242ac110002', 'session.manage', 'Manage All Sessions', 'Full session management across all users', 'session', 'manage', NOW());

-- Group Permissions
INSERT INTO permission (id, name, display_name, description, resource, action, created_at) VALUES
('72653ef6-006c-11f1-b74f-0242ac110002', 'group.create', 'Create Groups', 'Can create groups', 'group', 'create', NOW()),
('72653f64-006c-11f1-b74f-0242ac110002', 'group.read', 'View Groups', 'Can view group details', 'group', 'read', NOW()),
('72653fca-006c-11f1-b74f-0242ac110002', 'group.update', 'Update Groups', 'Can modify groups', 'group', 'update', NOW()),
('7265402f-006c-11f1-b74f-0242ac110002', 'group.delete', 'Delete Groups', 'Can delete groups', 'group', 'delete', NOW());

-- Invitation Permissions
INSERT INTO permission (id, name, display_name, description, resource, action, created_at) VALUES
('726540a4-006c-11f1-b74f-0242ac110002', 'invitation.send', 'Send Invitations', 'Can send invitations', 'invitation', 'create', NOW()),
('72654114-006c-11f1-b74f-0242ac110002', 'invitation.manage', 'Manage Invitations', 'Full invitation management', 'invitation', 'manage', NOW());

-- Client Permissions
INSERT INTO permission (id, name, display_name, description, resource, action, created_at) VALUES
('72654177-006c-11f1-b74f-0242ac110002', 'client.create', 'Create Client Relationships', 'Can create instructor-client relationships', 'client', 'create', NOW()),
('726541d7-006c-11f1-b74f-0242ac110002', 'client.read', 'View Clients', 'Can view client information', 'client', 'read', NOW()),
('72654260-006c-11f1-b74f-0242ac110002', 'client.update', 'Update Clients', 'Can update client information', 'client', 'update', NOW()),
('726542c0-006c-11f1-b74f-0242ac110002', 'client.delete', 'Delete Clients', 'Can remove client relationships', 'client', 'delete', NOW());

-- --------------------------------------------------------
-- Assign Permissions to SUPER_ADMIN (All Permissions)
-- --------------------------------------------------------
INSERT INTO role_permission (id, role_id, permission_id, created_at)
SELECT gen_random_uuid()::TEXT, '7261bd94-006c-11f1-b74f-0242ac110002', id, NOW()
FROM permission;

-- --------------------------------------------------------
-- Assign Permissions to ADMIN
-- --------------------------------------------------------
INSERT INTO role_permission (id, role_id, permission_id, created_at) VALUES
-- User management
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', NOW()), -- user.read
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653bcc-006c-11f1-b74f-0242ac110002', NOW()), -- user.update

-- Session management
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653e49-006c-11f1-b74f-0242ac110002', NOW()), -- session.manage

-- Group management
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()), -- group.read
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72653fca-006c-11f1-b74f-0242ac110002', NOW()), -- group.update

-- Invitation management
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '72654114-006c-11f1-b74f-0242ac110002', NOW()), -- invitation.manage

-- Client management
(gen_random_uuid()::TEXT, '7261d03c-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', NOW()); -- client.read

-- --------------------------------------------------------
-- Assign Permissions to SUPPORT
-- --------------------------------------------------------
INSERT INTO role_permission (id, role_id, permission_id, created_at) VALUES
-- Read-only access
(gen_random_uuid()::TEXT, '7261d117-006c-11f1-b74f-0242ac110002', '72653a6a-006c-11f1-b74f-0242ac110002', NOW()), -- user.read
(gen_random_uuid()::TEXT, '7261d117-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(gen_random_uuid()::TEXT, '7261d117-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()), -- group.read
(gen_random_uuid()::TEXT, '7261d117-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', NOW()); -- client.read

-- --------------------------------------------------------
-- Assign Permissions to INSTRUCTOR
-- --------------------------------------------------------
INSERT INTO role_permission (id, role_id, permission_id, created_at) VALUES
-- Session management (own sessions)
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653cb1-006c-11f1-b74f-0242ac110002', NOW()), -- session.create
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653d7a-006c-11f1-b74f-0242ac110002', NOW()), -- session.update
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653de0-006c-11f1-b74f-0242ac110002', NOW()), -- session.delete

-- Group management (own groups)
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653ef6-006c-11f1-b74f-0242ac110002', NOW()), -- group.create
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()), -- group.read
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72653fca-006c-11f1-b74f-0242ac110002', NOW()), -- group.update
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '7265402f-006c-11f1-b74f-0242ac110002', NOW()), -- group.delete

-- Invitation sending
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '726540a4-006c-11f1-b74f-0242ac110002', NOW()), -- invitation.send

-- Client management
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72654177-006c-11f1-b74f-0242ac110002', NOW()), -- client.create
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '726541d7-006c-11f1-b74f-0242ac110002', NOW()), -- client.read
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '72654260-006c-11f1-b74f-0242ac110002', NOW()), -- client.update
(gen_random_uuid()::TEXT, '7261d176-006c-11f1-b74f-0242ac110002', '726542c0-006c-11f1-b74f-0242ac110002', NOW()); -- client.delete

-- --------------------------------------------------------
-- Assign Permissions to USER
-- --------------------------------------------------------
INSERT INTO role_permission (id, role_id, permission_id, created_at) VALUES
-- Session viewing (join sessions)
(gen_random_uuid()::TEXT, '7261d1cc-006c-11f1-b74f-0242ac110002', '72653d13-006c-11f1-b74f-0242ac110002', NOW()), -- session.read
-- Group viewing (join groups)
(gen_random_uuid()::TEXT, '7261d1cc-006c-11f1-b74f-0242ac110002', '72653f64-006c-11f1-b74f-0242ac110002', NOW()); -- group.read

-- =========================================================
-- Roles and permissions seeded successfully
-- =========================================================
