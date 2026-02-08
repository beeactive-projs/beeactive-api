-- =========================================================
-- Migration 006: Seed Subscription Plans & Feature Flags
-- =========================================================
-- Initial subscription tiers and feature flags
-- =========================================================

-- --------------------------------------------------------
-- Insert Subscription Plans
-- --------------------------------------------------------
INSERT INTO `subscription_plan` (
  `id`, `name`, `slug`, `description`, `price`, `currency`, `billing_period`,
  `max_clients`, `max_sessions`, `features`, `is_active`, `display_order`,
  `stripe_price_id`, `created_at`, `updated_at`
) VALUES
-- Free Plan
(
  '7271272b-006c-11f1-b74f-0242ac110002',
  'Free',
  'free',
  'Perfect for getting started',
  0.00,
  'RON',
  'MONTHLY',
  5,        -- Max 5 clients
  20,       -- Max 20 sessions
  JSON_ARRAY('basic_scheduling', 'participant_management'),
  1,        -- Active
  1,        -- Display order
  NULL,     -- No Stripe ID for free plan
  NOW(),
  NOW()
),

-- Pro Plan
(
  '72713eb3-006c-11f1-b74f-0242ac110002',
  'Pro',
  'pro',
  'Everything you need to grow your business',
  99.00,
  'RON',
  'MONTHLY',
  50,       -- Max 50 clients
  NULL,     -- Unlimited sessions
  JSON_ARRAY(
    'basic_scheduling',
    'participant_management',
    'advanced_analytics',
    'custom_branding',
    'priority_support',
    'recurring_sessions'
  ),
  1,
  2,
  NULL,     -- Set Stripe Price ID after creating in Stripe
  NOW(),
  NOW()
),

-- Enterprise Plan
(
  '72713fb7-006c-11f1-b74f-0242ac110002',
  'Enterprise',
  'enterprise',
  'For large organizations and teams',
  299.00,
  'RON',
  'MONTHLY',
  NULL,     -- Unlimited clients
  NULL,     -- Unlimited sessions
  JSON_ARRAY(
    'basic_scheduling',
    'participant_management',
    'advanced_analytics',
    'custom_branding',
    'priority_support',
    'recurring_sessions',
    'api_access',
    'white_label',
    'dedicated_support',
    'sso_integration',
    'custom_integrations'
  ),
  1,
  3,
  NULL,
  NOW(),
  NOW()
);

-- --------------------------------------------------------
-- Insert Feature Flags
-- --------------------------------------------------------
INSERT INTO `feature_flag` (
  `id`, `key`, `name`, `description`, `enabled`, `required_plans`, `metadata`, `created_at`, `updated_at`
) VALUES
-- Analytics Features
(
  '72731ce9-006c-11f1-b74f-0242ac110002',
  'advanced_analytics',
  'Advanced Analytics',
  'Detailed reports and insights',
  1,
  JSON_ARRAY('pro', 'enterprise'),
  NULL,
  NOW(),
  NOW()
),

-- Branding Features
(
  '72732601-006c-11f1-b74f-0242ac110002',
  'custom_branding',
  'Custom Branding',
  'Use your own logo and colors',
  1,
  JSON_ARRAY('pro', 'enterprise'),
  NULL,
  NOW(),
  NOW()
),

(
  '7273280c-006c-11f1-b74f-0242ac110002',
  'white_label',
  'White Label',
  'Remove BeeActive branding',
  1,
  JSON_ARRAY('enterprise'),
  NULL,
  NOW(),
  NOW()
),

-- Session Features
(
  '72732711-006c-11f1-b74f-0242ac110002',
  'recurring_sessions',
  'Recurring Sessions',
  'Create sessions that repeat automatically',
  1,
  JSON_ARRAY('pro', 'enterprise'),
  NULL,
  NOW(),
  NOW()
),

-- Integration Features
(
  '72732798-006c-11f1-b74f-0242ac110002',
  'api_access',
  'API Access',
  'Programmatic access to your data',
  1,
  JSON_ARRAY('enterprise'),
  NULL,
  NOW(),
  NOW()
),

-- Payment Features (Coming Soon)
(
  '7273287a-006c-11f1-b74f-0242ac110002',
  'payment_processing',
  'Payment Processing',
  'Accept payments from participants',
  0,        -- Not enabled yet
  JSON_ARRAY('pro', 'enterprise'),
  JSON_OBJECT('coming_soon', true),
  NOW(),
  NOW()
),

-- Communication Features (Coming Soon)
(
  '72732f45-006c-11f1-b74f-0242ac110002',
  'sms_notifications',
  'SMS Notifications',
  'Send SMS reminders to participants',
  0,        -- Not enabled yet
  JSON_ARRAY('pro', 'enterprise'),
  JSON_OBJECT('coming_soon', true),
  NOW(),
  NOW()
),

-- Video Features (Future)
(
  UUID(),
  'video_conferencing',
  'Video Conferencing',
  'Built-in video calls for online sessions',
  0,
  JSON_ARRAY('pro', 'enterprise'),
  JSON_OBJECT('coming_soon', true, 'estimated_release', '2026-Q2'),
  NOW(),
  NOW()
);

-- =========================================================
-- Plans and features seeded successfully
-- =========================================================
