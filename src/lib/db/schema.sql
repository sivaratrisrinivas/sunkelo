CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_range TEXT,
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_is_trending ON products(is_trending);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'en-IN',
  verdict TEXT NOT NULL CHECK (verdict IN ('buy', 'skip', 'wait')),
  confidence_score DOUBLE PRECISION NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  summary TEXT NOT NULL,
  tldr TEXT NOT NULL,
  pros JSONB NOT NULL DEFAULT '[]'::jsonb,
  cons JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_for TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_language_code ON reviews(language_code);

CREATE TABLE IF NOT EXISTS review_translations (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  summary TEXT NOT NULL,
  tldr TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(review_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_review_translations_review_id ON review_translations(review_id);

CREATE TABLE IF NOT EXISTS review_audio_assets (
  audio_key TEXT PRIMARY KEY,
  review_id BIGINT REFERENCES reviews(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/wav',
  audio_base64 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  duration_seconds DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_audio_assets_review_id ON review_audio_assets(review_id);

CREATE TABLE IF NOT EXISTS query_logs (
  id BIGSERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  transcript TEXT,
  language_code TEXT,
  intent TEXT,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at DESC);
