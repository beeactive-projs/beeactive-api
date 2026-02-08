# 🚀 Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- MySQL running
- Redis running (optional, for background jobs)
- Text editor (VS Code recommended)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Generate JWT secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# Edit .env and paste the generated secrets
```

Required variables:
- `JWT_SECRET` (generate with command above)
- `JWT_REFRESH_SECRET` (generate with command above)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `REDIS_HOST`, `REDIS_PORT`

## Step 3: Run Database Migration

```bash
mysql -u root -p < migrations/001_add_security_fields.sql
```

Or manually:
```bash
mysql -u root -p
```
```sql
USE beeactive;
ALTER TABLE user
ADD COLUMN failed_login_attempts INT DEFAULT 0 NOT NULL,
ADD COLUMN locked_until DATETIME NULL,
MODIFY email VARCHAR(255) NOT NULL UNIQUE;
```

## Step 4: Start the Server

```bash
# Development mode (auto-reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Step 5: Test the API

### Open Swagger UI
http://localhost:3000/api/docs

### Health Check
```bash
curl http://localhost:3000/health
```

### Register User
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ssw0rd!",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecureP@ssw0rd!"
  }'
```

Copy the `accessToken` from response.

### Get Profile
```bash
curl http://localhost:3000/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

## 🎉 Done!

Your API is running with:
- ✅ JWT authentication
- ✅ Rate limiting
- ✅ Account lockout
- ✅ Password reset
- ✅ Security headers
- ✅ Input validation
- ✅ Structured logging

## Next Steps

1. Read [SECURITY_IMPROVEMENTS.md](./SECURITY_IMPROVEMENTS.md) for full documentation
2. Integrate email service for password reset
3. Set up monitoring (DataDog, New Relic, etc.)
4. Configure CI/CD pipeline
5. Add more endpoints for your business logic

## Troubleshooting

### App won't start - "JWT_SECRET is required"
→ Make sure you set `JWT_SECRET` and `JWT_REFRESH_SECRET` in `.env`

### Database error - "Column 'failed_login_attempts' doesn't exist"
→ Run the migration: `mysql -u root -p < migrations/001_add_security_fields.sql`

### Cannot connect to database
→ Check MySQL is running and credentials in `.env` are correct

### Redis connection error
→ Start Redis: `redis-server` or disable Bull queues temporarily

### Port 3000 already in use
→ Change `PORT=3001` in `.env` or stop the other process

## Need Help?

- Check Swagger docs: http://localhost:3000/api/docs
- Read full documentation: [SECURITY_IMPROVEMENTS.md](./SECURITY_IMPROVEMENTS.md)
- Check logs: They now include request IDs for easy debugging!
