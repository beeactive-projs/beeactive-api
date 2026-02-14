#!/bin/bash

# =========================================================
# BeeActive API - Database Migration Runner
# =========================================================
# Runs all migrations in order
#
# Usage:
#   ./RUN_MIGRATIONS.sh [database] [username] [password]
#
# Examples:
#   ./RUN_MIGRATIONS.sh beeactive root mypassword
#   ./RUN_MIGRATIONS.sh  (uses defaults: beeactive root root)
# =========================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DB_NAME="${1:-beeactive}"
DB_USER="${2:-root}"
DB_PASS="${3:-root}"
DB_HOST="${4:-localhost}"

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}  BeeActive API - Database Migration Runner${NC}"
echo -e "${BLUE}==========================================================${NC}"
echo ""
echo -e "${YELLOW}Database:${NC} $DB_NAME"
echo -e "${YELLOW}User:${NC} $DB_USER"
echo -e "${YELLOW}Host:${NC} $DB_HOST"
echo ""

# Check if MySQL is available
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}❌ Error: MySQL client not found${NC}"
    echo "Please install MySQL client first"
    exit 1
fi

# Test database connection
echo -e "${BLUE}Testing database connection...${NC}"
if ! mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" -e "SELECT 1;" &> /dev/null; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    echo "Please check your credentials"
    exit 1
fi
echo -e "${GREEN}✓ Connection successful${NC}"
echo ""

# Confirm before dropping schema
echo -e "${RED}⚠️  WARNING: This will DROP all existing tables!${NC}"
echo -e "${RED}⚠️  All data will be lost!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Migration cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}  Running Migrations${NC}"
echo -e "${BLUE}==========================================================${NC}"
echo ""

# Function to run a migration
run_migration() {
    local file=$1
    local name=$(basename "$file" .sql)

    echo -e "${BLUE}Running:${NC} $name"

    if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$file"; then
        echo -e "${GREEN}✓ Success:${NC} $name"
        return 0
    else
        echo -e "${RED}✗ Failed:${NC} $name"
        return 1
    fi
}

# Run migrations in order
FAILED=0

run_migration "000_drop_existing_schema.sql" || FAILED=1
run_migration "001_create_core_tables.sql" || FAILED=1
run_migration "002_create_organization_tables.sql" || FAILED=1
run_migration "003_create_session_tables.sql" || FAILED=1
run_migration "004_create_profile_tables.sql" || FAILED=1
run_migration "005_seed_roles_permissions.sql" || FAILED=1
run_migration "006_seed_plans_features.sql" || FAILED=1
run_migration "007_create_super_admin.sql" || FAILED=1
run_migration "008_update_profiles_and_members.sql" || FAILED=1
run_migration "009_add_email_verification_expires.sql" || FAILED=1
run_migration "010_add_organization_discovery_fields.sql" || FAILED=1

echo ""
echo -e "${BLUE}==========================================================${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}  ✓ All migrations completed successfully!${NC}"
    echo -e "${BLUE}==========================================================${NC}"
    echo ""
    echo -e "${GREEN}Super Admin Account Created:${NC}"
    echo -e "  Email:    ${YELLOW}beeactivedev@gmail.com${NC}"
    echo -e "  Password: ${YELLOW}BeeActive2026!Admin${NC}"
    echo ""
    echo -e "${RED}⚠️  IMPORTANT: Change this password after first login!${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "  1. Start your API: npm run start:dev"
    echo "  2. Login at: http://localhost:3000/auth/login"
    echo "  3. Change your password immediately"
    echo "  4. Explore Swagger docs: http://localhost:3000/api/docs"
    echo ""
    exit 0
else
    echo -e "${RED}  ✗ Some migrations failed${NC}"
    echo -e "${BLUE}==========================================================${NC}"
    echo ""
    echo "Please check the error messages above and fix the issues"
    exit 1
fi
