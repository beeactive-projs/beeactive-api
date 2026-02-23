-- =========================================================
-- Migration 008: Create Blog Table
-- =========================================================

CREATE TABLE IF NOT EXISTS blog_post (
  id CHAR(36) NOT NULL DEFAULT gen_random_uuid()::TEXT,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT,
  content TEXT,
  category VARCHAR(50),
  cover_image VARCHAR(500),
  author_name VARCHAR(100),
  author_initials VARCHAR(10),
  author_role VARCHAR(100),
  read_time INTEGER DEFAULT 5,
  tags JSON DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  PRIMARY KEY (id)
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_post_slug ON blog_post (slug);
CREATE INDEX IF NOT EXISTS idx_blog_post_category ON blog_post (category);
CREATE INDEX IF NOT EXISTS idx_blog_post_is_published ON blog_post (is_published);
CREATE INDEX IF NOT EXISTS idx_blog_post_published_at ON blog_post (published_at);

-- =========================================================
-- Blog table created successfully
-- =========================================================
