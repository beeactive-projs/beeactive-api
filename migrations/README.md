# 🗄️ Database Migrations

Complete database schema for BeeActive API with all security improvements and RBAC.

## 📋 Migration Files

| File | Description |
|------|-------------|
| `000_drop_existing_schema.sql` | ⚠️ Drops all existing tables (clean slate) |
| `001_create_core_tables.sql` | User, Role, Permission, Auth tables |
| `002_create_organization_tables.sql` | Organization, Subscription, Feature flags |
| `003_create_session_tables.sql` | Session, Participant, Invitation tables |
| `004_create_profile_tables.sql` | Organizer & Participant profiles |
| `005_seed_roles_permissions.sql` | Initial roles & permissions data |
| `006_seed_plans_features.sql` | Subscription plans & feature flags |
| `007_create_super_admin.sql` | Super admin account |

## 🚀 Quick Start

### Option 1: Run All Migrations (Recommended)

**Linux/Mac:**
```bash
cd migrations
./RUN_MIGRATIONS.sh
```

**Windows:**
```cmd
cd migrations
RUN_MIGRATIONS.bat
```

**With custom credentials:**
```bash
./RUN_MIGRATIONS.sh beeactive root your_password localhost
```

### Option 2: Manual Execution

```bash
cd migrations

# 1. Drop existing schema
mysql -u root -p beeactive < 000_drop_existing_schema.sql

# 2. Create tables
mysql -u root -p beeactive < 001_create_core_tables.sql
mysql -u root -p beeactive < 002_create_organization_tables.sql
mysql -u root -p beeactive < 003_create_session_tables.sql
mysql -u root -p beeactive < 004_create_profile_tables.sql

# 3. Seed data
mysql -u root -p beeactive < 005_seed_roles_permissions.sql
mysql -u root -p beeactive < 006_seed_plans_features.sql
mysql -u root -p beeactive < 007_create_super_admin.sql
```

### Option 3: Railway Production

```bash
# Connect to Railway MySQL
railway connect mysql

# Run migrations (paste each file content)
SOURCE /path/to/migrations/000_drop_existing_schema.sql;
SOURCE /path/to/migrations/001_create_core_tables.sql;
# ... etc
```

## 🔐 Super Admin Credentials

After running migrations, you can login with:

```
Email:    beeactivedev@gmail.com
Password: BeeActive2026!Admin
```

**⚠️ IMPORTANT:** Change this password immediately after first login!

## 📊 Database Schema Overview

### Core Tables (001)
- **user** - User accounts with security features
  - Email required (NOT NULL)
  - Password hashing (bcrypt 12 rounds)
  - Account lockout (failed_login_attempts, locked_until)
  - Password reset tokens (hashed with SHA-256)
- **role** - User roles (SUPER_ADMIN, ADMIN, SUPPORT, ORGANIZER, PARTICIPANT)
- **permission** - Granular permissions
- **user_role** - User-to-role assignments
- **role_permission** - Role-to-permission assignments
- **refresh_token** - JWT refresh tokens (hashed)
- **social_account** - OAuth social login

### Organization Tables (002)
- **organization** - Multi-tenant organizations
- **organization_member** - Organization membership
- **subscription_plan** - Free, Pro, Enterprise plans
- **organization_subscription** - Active subscriptions
- **feature_flag** - Feature toggles

### Session Tables (003)
- **session** - Training sessions
- **session_participant** - Session registrations
- **invitation** - User invitations

### Profile Tables (004)
- **organizer_profile** - Trainer profiles
- **participant_profile** - Client profiles

## 🔑 Roles & Permissions

### Roles Hierarchy (by level)

1. **SUPER_ADMIN** (level 1)
   - Full platform access
   - All permissions
   - System role (cannot be deleted)

2. **ADMIN** (level 2)
   - Platform administration
   - User & session management
   - Organization management

3. **SUPPORT** (level 3)
   - Read-only access
   - Customer support

5. **ORGANIZER** (level 5)
   - Create & manage sessions
   - Invite participants
   - View own sessions

10. **PARTICIPANT** (level 10)
    - Join sessions
    - View own profile

### Permission Structure

Permissions follow the format: `resource.action`

**Resources:**
- user
- session
- organization
- invitation
- feature
- subscription

**Actions:**
- create
- read
- update
- delete
- manage (full control)

**Examples:**
- `user.create` - Can create users
- `session.manage` - Full session management
- `organization.read` - View organization details

## 💳 Subscription Plans

| Plan | Price | Clients | Sessions | Features |
|------|-------|---------|----------|----------|
| **Free** | RON 0/month | 5 | 20 | Basic scheduling, Participant management |
| **Pro** | RON 99/month | 50 | Unlimited | + Analytics, Branding, Recurring sessions |
| **Enterprise** | RON 299/month | Unlimited | Unlimited | + API access, White label, SSO |

## 🚩 Feature Flags

| Feature | Plans | Status |
|---------|-------|--------|
| advanced_analytics | Pro, Enterprise | ✅ Enabled |
| custom_branding | Pro, Enterprise | ✅ Enabled |
| white_label | Enterprise | ✅ Enabled |
| recurring_sessions | Pro, Enterprise | ✅ Enabled |
| api_access | Enterprise | ✅ Enabled |
| payment_processing | Pro, Enterprise | 🔜 Coming Soon |
| sms_notifications | Pro, Enterprise | 🔜 Coming Soon |
| video_conferencing | Pro, Enterprise | 🔜 2026-Q2 |

## 🔒 Security Features

All migrations include enterprise-grade security:

### User Table Security
- ✅ Email required (NOT NULL)
- ✅ Password hashing (bcrypt 12 rounds)
- ✅ Account lockout after 5 failed attempts
- ✅ 15-minute lockout period
- ✅ Password reset tokens hashed (SHA-256)
- ✅ Email verification tokens hashed (SHA-256)
- ✅ Soft deletes (deleted_at)

### Token Security
- ✅ Refresh tokens hashed (SHA-256)
- ✅ Token expiration tracking
- ✅ Manual revocation support
- ✅ Device & IP tracking

### Indexes for Performance
- ✅ All foreign keys indexed
- ✅ Email indexed (unique)
- ✅ Compound indexes on common queries
- ✅ Deleted_at indexed (soft delete queries)

## 📝 Data Relationships

```
user
 ├─> user_role ─> role ─> role_permission ─> permission
 ├─> organization_member ─> organization ─> organization_subscription ─> subscription_plan
 ├─> session ─> session_participant
 ├─> invitation
 ├─> refresh_token
 ├─> social_account
 ├─> organizer_profile
 └─> participant_profile
```

## 🧪 Verification Queries

After running migrations, verify everything:

```sql
-- Check all tables created
SHOW TABLES;

-- Verify super admin
SELECT id, email, first_name, last_name, is_email_verified
FROM user
WHERE email = 'beeactivedev@gmail.com';

-- Check roles
SELECT * FROM role ORDER BY level;

-- Check permissions count
SELECT COUNT(*) as permission_count FROM permission;

-- Check role-permission assignments
SELECT r.name, COUNT(*) as permission_count
FROM role r
JOIN role_permission rp ON r.id = rp.role_id
GROUP BY r.name;

-- Check subscription plans
SELECT name, slug, price, billing_period
FROM subscription_plan
WHERE is_active = 1
ORDER BY display_order;

-- Check feature flags
SELECT key, name, enabled
FROM feature_flag
ORDER BY name;
```

## 🔄 Rollback

If you need to rollback:

```sql
-- Run 000_drop_existing_schema.sql to drop all tables
-- Then run your old schema file
```

## 📚 Additional Documentation

- [SECURITY_IMPROVEMENTS.md](../SECURITY_IMPROVEMENTS.md) - Security features explained
- [QUICK_START.md](../QUICK_START.md) - API setup guide
- [NESTJS_GUIDE.md](../NESTJS_GUIDE.md) - NestJS concepts

## 🆘 Troubleshooting

### Error: "Access denied"
→ Check your MySQL username and password

### Error: "Database doesn't exist"
→ Create database first: `CREATE DATABASE beeactive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

### Error: "Foreign key constraint fails"
→ Run migrations in order (000 → 007)

### Error: "Table already exists"
→ Run `000_drop_existing_schema.sql` first

## 🎯 Next Steps

After migrations:

1. ✅ Run migrations
2. ✅ Verify super admin account
3. ✅ Start API: `npm run start:dev`
4. ✅ Login at: http://localhost:3000/auth/login
5. ⚠️ Change super admin password!
6. ✅ Test endpoints in Swagger: http://localhost:3000/api/docs
7. ✅ Create your first organization
8. ✅ Invite team members

## 🤝 Contributing

When adding new migrations:

1. Number sequentially: `008_your_migration.sql`
2. Add to `RUN_MIGRATIONS.sh` and `RUN_MIGRATIONS.bat`
3. Update this README
4. Include rollback instructions
5. Test on fresh database

---

**Ready to migrate?** Run `./RUN_MIGRATIONS.sh` and start building! 🚀
