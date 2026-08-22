CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings(key,value) VALUES
('generate_count','1'),('bonus_limit','5'),('max_redeem_users','0')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS redeem_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  bonus_limit INTEGER NOT NULL DEFAULT 5 CHECK (bonus_limit BETWEEN 1 AND 9999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS redemptions (
  id BIGSERIAL PRIMARY KEY,
  code_id BIGINT NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code_id,ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_redemptions_code ON redemptions(code_id);

CREATE TABLE IF NOT EXISTS usage_daily (
  ip_hash TEXT NOT NULL,
  usage_date DATE NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(ip_hash,usage_date)
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(ip_hash,created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  ip_hash TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
