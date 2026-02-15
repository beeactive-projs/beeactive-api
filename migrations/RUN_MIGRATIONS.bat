@echo off
REM =========================================================
REM BeeActive API - Database Migration Runner (Windows)
REM =========================================================
REM Runs all migrations in order
REM
REM Usage:
REM   RUN_MIGRATIONS.bat [database] [username] [password] [host]
REM
REM Examples:
REM   RUN_MIGRATIONS.bat beeactive root mypassword localhost
REM   RUN_MIGRATIONS.bat  (uses defaults)
REM =========================================================

SETLOCAL EnableDelayedExpansion

REM Default values
SET DB_NAME=%1
SET DB_USER=%2
SET DB_PASS=%3
SET DB_HOST=%4

IF "%DB_NAME%"=="" SET DB_NAME=beeactive
IF "%DB_USER%"=="" SET DB_USER=root
IF "%DB_PASS%"=="" SET DB_PASS=root
IF "%DB_HOST%"=="" SET DB_HOST=localhost

echo ==========================================================
echo   BeeActive API - Database Migration Runner
echo ==========================================================
echo.
echo Database: %DB_NAME%
echo User: %DB_USER%
echo Host: %DB_HOST%
echo.

REM Check if MySQL is available
where mysql >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: MySQL client not found
    echo Please install MySQL client first
    pause
    exit /b 1
)

REM Test connection
echo Testing database connection...
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% -e "SELECT 1;" >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Cannot connect to database
    echo Please check your credentials
    pause
    exit /b 1
)
echo Connection successful
echo.

REM Confirm
echo WARNING: This will DROP all existing tables!
echo WARNING: All data will be lost!
echo.
SET /P CONFIRM=Are you sure you want to continue? (yes/no):
IF NOT "%CONFIRM%"=="yes" (
    echo Migration cancelled
    pause
    exit /b 0
)

echo.
echo ==========================================================
echo   Running Migrations
echo ==========================================================
echo.

SET FAILED=0

REM Run migrations in order
echo Running: 000_drop_existing_schema.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 000_drop_existing_schema.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 001_create_core_tables.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 001_create_core_tables.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 002_create_group_tables.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 002_create_group_tables.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 003_create_session_tables.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 003_create_session_tables.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 004_create_profile_tables.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 004_create_profile_tables.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 005_seed_roles_permissions.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 005_seed_roles_permissions.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 006_create_super_admin.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 006_create_super_admin.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo Running: 007_create_client_tables.sql
mysql -h%DB_HOST% -u%DB_USER% -p%DB_PASS% %DB_NAME% < 007_create_client_tables.sql
IF %ERRORLEVEL% NEQ 0 SET FAILED=1

echo.
echo ==========================================================

IF %FAILED%==0 (
    echo   All migrations completed successfully!
    echo ==========================================================
    echo.
    echo Super Admin Account Created:
    echo   Email:    beeactivedev@gmail.com
    echo   Password: BeeActive2026!Admin
    echo.
    echo WARNING: Change this password after first login!
    echo.
    echo Next Steps:
    echo   1. Start your API: npm run start:dev
    echo   2. Login at: http://localhost:3000/auth/login
    echo   3. Change your password immediately
    echo   4. Explore Swagger docs: http://localhost:3000/api/docs
    echo.
) ELSE (
    echo   Some migrations failed
    echo ==========================================================
    echo.
    echo Please check the error messages above and fix the issues
)

pause
exit /b %FAILED%
