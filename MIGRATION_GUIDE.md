# 🗄️ Complete Migration Guide - BeeActive API

## 🎯 Overview

This guide covers the complete database migration strategy for BeeActive API, replacing the old schema with a production-ready, secure, and well-structured database.

## ✨ What's New in This Migration

### Security Improvements ✅
- ✅ Email field now **required** (NOT NULL)
- ✅ Account lockout fields added (failed_login_attempts, locked_until)
- ✅ All tokens **hashed with SHA-256** before storage
- ✅ Password hashing with **bcrypt 12 rounds** (was 10)
- ✅ Refresh token table with device tracking
- ✅ Comprehensive indexes for performance

### Schema Improvements ✅
- ✅ Proper foreign key constraints
- ✅ Consistent naming conventions (snake_case)
- ✅ Comprehensive indexes
- ✅ Soft deletes (deleted_at)
- ✅ Timestamps on all tables
- ✅ JSON fields for flexible data
- ✅ Proper charset (utf8mb4) for emoji support

### Data Improvements ✅
- ✅ Complete RBAC with 5 roles
- ✅ 18 granular permissions
- ✅ 3 subscription plans (Free, Pro, Enterprise)
- ✅ 8 feature flags
- ✅ Super admin account pre-created

## 📦 Migration Files Structure

```
migrations/
├── 000_drop_existing_schema.sql      # Clean slate
├── 001_create_core_tables.sql        # User, Role, Permission, Auth
├── 002_create_organization_tables.sql # Organizations & Subscriptions
├── 003_create_session_tables.sql     # Sessions & Invitations
├── 004_create_profile_tables.sql     # User profiles
├── 005_seed_roles_permissions.sql    # RBAC seed data
├── 006_seed_plans_features.sql       # Plans & features
├── 007_create_super_admin.sql        # Super admin user
├── RUN_MIGRATIONS.sh                 # Linux/Mac runner
├── RUN_MIGRATIONS.bat                # Windows runner
└── README.md                         # This file
```

## 🚀 Running Migrations

### Step 1: Backup Current Database (If Needed)

```bash
# Backup current database
mysqldump -u root -p beeactive > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Migrations

**Linux/Mac:**
```bash
cd /Users/ionutbutnaru/Documents/mystuff/beeactive-api/migrations
./RUN_MIGRATIONS.sh
```

**Windows:**
```cmd
cd C:\path\to\beeactive-api\migrations
RUN_MIGRATIONS.bat
```

**With Custom Credentials:**
```bash
./RUN_MIGRATIONS.sh beeactive root your_password localhost
```

### Step 3: Verify Migration

```bash
mysql -u root -p beeactive
```

```sql
-- Verify tables
SHOW TABLES;

-- Should show 17 tables:
-- feature_flag
-- invitation
-- organization
-- organization_member
-- organization_subscription
-- organizer_profile
-- participant_profile
-- permission
-- refresh_token
-- role
-- role_permission
-- session
-- session_participant
-- social_account
-- subscription_plan
-- user
-- user_role

-- Verify super admin
SELECT * FROM user WHERE email = 'beeactivedev@gmail.com';

-- Check roles
SELECT * FROM role ORDER BY level;

-- Check permissions
SELECT COUNT(*) FROM permission; -- Should be 18

-- Check super admin has all permissions
SELECT COUNT(*) FROM role_permission
WHERE role_id = '7261bd94-006c-11f1-b74f-0242ac110002'; -- Should be 18
```

## 🔐 Super Admin Account

### Credentials

```
Email:    beeactivedev@gmail.com
Password: BeeActive2026!Admin
```

### First Login Checklist

1. ✅ Login at: `POST /auth/login`
2. ✅ Get your access token
3. ⚠️ **IMMEDIATELY change password** at: `POST /auth/reset-password`
4. ✅ Update your profile at: `GET /users/me`
5. ✅ Test creating an organization
6. ✅ Test inviting a user

### Test Super Admin Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "beeactivedev@gmail.com",
    "password": "BeeActive2026!Admin"
  }'
```

Response should include:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "email": "beeactivedev@gmail.com",
    "first_name": "BeeActive",
    "last_name": "Admin"
  }
}
```

## 📊 Schema Comparison

### Old Schema → New Schema

| Feature | Old Schema | New Schema |
|---------|------------|------------|
| **User table** | | |
| Email nullable | ✅ Yes (bug!) | ❌ Required |
| Account lockout | ❌ No | ✅ Yes (5 attempts) |
| Token hashing | ❌ Plain text | ✅ SHA-256 hashed |
| Bcrypt rounds | 10 | 12 |
| Soft deletes | ✅ Yes | ✅ Yes |
| | | |
| **Indexes** | Basic | Comprehensive |
| **Foreign Keys** | ✅ Yes | ✅ Yes |
| **Constraints** | Basic | Production-ready |
| **Comments** | ❌ No | ✅ All tables/columns |

## 🔄 Migration Impact

### Breaking Changes

1. **Email field now required**
   - Old: `email VARCHAR(255) NULL`
   - New: `email VARCHAR(255) NOT NULL`
   - Impact: Cannot create users without email

2. **API routes now versioned**
   - Old: `/auth/login`
   - New: `/auth/login`
   - Impact: Update all API calls

3. **JWT expiration reduced**
   - Old: 7 days
   - New: 2 hours (+ refresh tokens)
   - Impact: Implement refresh token logic

4. **Strong password requirements**
   - Old: 8+ characters
   - New: 8+ chars + complexity rules
   - Impact: Users must create strong passwords

### Non-Breaking Changes

- Account lockout (new security feature)
- Hashed tokens (transparent to users)
- New tables (sessions, organizations, profiles)
- New roles and permissions

## 🧪 Testing After Migration

### 1. Test Authentication

```bash
# Register new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestUser2026!",
    "first_name": "Test",
    "last_name": "User"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestUser2026!"
  }'
```

### 2. Test Account Lockout

```bash
# Try wrong password 6 times
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "WrongPassword!"
    }'
  echo "\nAttempt $i"
done

# 6th attempt should return account locked error
```

### 3. Test Password Reset

```bash
# Request reset
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'

# Check logs for reset token
# Use token to reset password
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_LOGS",
    "newPassword": "NewTestPass2026!"
  }'
```

### 4. Test Refresh Token

```bash
# Login and save refresh token
REFRESH_TOKEN="your_refresh_token_here"

# Use refresh token to get new access token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }"
```

### 5. Test RBAC

```bash
# As SUPER_ADMIN, create a user
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "organizer@example.com",
    "password": "Organizer2026!",
    "first_name": "John",
    "last_name": "Trainer"
  }'

# Assign ORGANIZER role
curl -X POST http://localhost:3000/users/{userId}/roles \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roleId": "7261d176-006c-11f1-b74f-0242ac110002"
  }'
```

## 🚨 Troubleshooting

### Issue: "Cannot connect to database"

**Solution:**
```bash
# Check MySQL is running
mysql -u root -p -e "SELECT 1;"

# Check database exists
mysql -u root -p -e "SHOW DATABASES LIKE 'beeactive';"

# Create if missing
mysql -u root -p -e "CREATE DATABASE beeactive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Issue: "Foreign key constraint fails"

**Solution:**
- Run migrations in order (000 → 007)
- Don't skip any migration
- Check previous migration completed successfully

### Issue: "Table already exists"

**Solution:**
```bash
# Run drop schema first
mysql -u root -p beeactive < migrations/000_drop_existing_schema.sql
```

### Issue: "Duplicate entry for key 'PRIMARY'"

**Solution:**
- Run `000_drop_existing_schema.sql` first
- This is a fresh install, not an update

### Issue: "Super admin login fails"

**Check:**
```sql
SELECT * FROM user WHERE email = 'beeactivedev@gmail.com';
-- Verify password_hash is: $2b$12$PLj53tJHNArlkV/GLtXI5uwri/TrGNjzJIkdQcTHI4fbhgahzfqjC

SELECT * FROM user_role WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Verify role_id is: 7261bd94-006c-11f1-b74f-0242ac110002 (SUPER_ADMIN)
```

## 📱 Railway Production Deployment

### Step 1: Connect to Railway MySQL

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Connect to MySQL
railway connect mysql
```

### Step 2: Run Migrations

```sql
-- In Railway MySQL shell, run each file:
SOURCE /path/to/000_drop_existing_schema.sql;
SOURCE /path/to/001_create_core_tables.sql;
-- ... etc
```

### Step 3: Update Environment Variables

In Railway dashboard, ensure:
```
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<different-64-char-random-string>
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
NODE_ENV=production
```

### Step 4: Redeploy

```bash
git push
# Railway auto-deploys
```

### Step 5: Verify

```bash
curl https://beeactive-api-production.up.railway.app/health
# Should return: {"status":"ok","info":{"database":{"status":"up"}}}
```

## 📚 Related Documentation

- [SECURITY_IMPROVEMENTS.md](./SECURITY_IMPROVEMENTS.md) - All security features explained
- [QUICK_START.md](./QUICK_START.md) - Get started in 5 minutes
- [NESTJS_GUIDE.md](./NESTJS_GUIDE.md) - NestJS concepts for beginners
- [migrations/README.md](./migrations/README.md) - Migration file details

## ✅ Post-Migration Checklist

- [ ] Migrations completed successfully
- [ ] All 17 tables created
- [ ] Super admin can login
- [ ] Super admin password changed
- [ ] Test user registration works
- [ ] Test login works
- [ ] Test password reset works
- [ ] Test refresh token works
- [ ] Test account lockout works
- [ ] Swagger docs accessible
- [ ] Health check endpoint works
- [ ] API versioning (/) works
- [ ] Railway deployment updated (if applicable)
- [ ] Environment variables updated
- [ ] Old backup deleted (after 30 days)

## 🎉 Success!

Your database is now:
- ✅ Secure (enterprise-grade)
- ✅ Scalable (proper indexes, foreign keys)
- ✅ Well-structured (normalized, consistent naming)
- ✅ Production-ready (soft deletes, timestamps, constraints)
- ✅ Documented (comprehensive comments)

**Ready to build!** 🚀

---

Need help? Check the documentation or ask in the issues!
