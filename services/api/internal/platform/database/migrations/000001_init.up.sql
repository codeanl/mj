CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'user',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_role_check CHECK (role IN ('user', 'admin')),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

UPDATE users
SET role = 'admin', updated_at = now()
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

CREATE TABLE IF NOT EXISTS media_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    source text NOT NULL DEFAULT 'uploaded',
    status text NOT NULL DEFAULT 'ready',
    title text NOT NULL,
    original_name text NOT NULL,
    storage_key text NOT NULL UNIQUE,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    width integer NOT NULL DEFAULT 0,
    height integer NOT NULL DEFAULT 0,
    duration_seconds numeric,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT media_assets_kind_check CHECK (kind IN ('image', 'video')),
    CONSTRAINT media_assets_source_check CHECK (source IN ('generated', 'uploaded')),
    CONSTRAINT media_assets_status_check CHECK (status IN ('generating', 'ready', 'failed')),
    CONSTRAINT media_assets_size_check CHECK (size_bytes >= 0),
    CONSTRAINT media_assets_dimensions_check CHECK (width >= 0 AND height >= 0)
);

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'uploaded' CHECK (source IN ('generated', 'uploaded'));

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'failed'));

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE media_assets ALTER COLUMN original_name DROP NOT NULL;
ALTER TABLE media_assets ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE media_assets ALTER COLUMN mime_type DROP NOT NULL;

CREATE TABLE IF NOT EXISTS generation_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    provider text NOT NULL,
    model text NOT NULL,
    prompt text NOT NULL,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    CONSTRAINT generation_tasks_kind_check CHECK (kind IN ('image', 'video')),
    CONSTRAINT generation_tasks_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
);

CREATE TABLE IF NOT EXISTS model_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    base_url text NOT NULL,
    protocol text NOT NULL DEFAULT 'openai',
    api_key_ciphertext text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    last_test_status text NOT NULL DEFAULT 'untested',
    last_test_message text NOT NULL DEFAULT '',
    last_tested_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT model_channels_protocol_check CHECK (protocol IN ('openai')),
    CONSTRAINT model_channels_test_status_check CHECK (last_test_status IN ('untested', 'success', 'failed'))
);

CREATE TABLE IF NOT EXISTS channel_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES model_channels(id) ON DELETE CASCADE,
    model_id text NOT NULL,
    display_name text NOT NULL,
    capability text NOT NULL DEFAULT 'image',
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT channel_models_capability_check CHECK (capability IN ('image')),
    CONSTRAINT channel_models_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_models_model_id_unique_lower ON channel_models (lower(model_id));
CREATE INDEX IF NOT EXISTS channel_models_channel_sort_idx ON channel_models (channel_id, sort_order ASC, created_at ASC);

ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES model_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generation_tasks_status_created_idx ON generation_tasks (status, created_at ASC);
CREATE INDEX IF NOT EXISTS generation_tasks_user_created_idx ON generation_tasks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_user_created_idx ON media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_user_kind_created_idx ON media_assets (user_id, kind, created_at DESC);
