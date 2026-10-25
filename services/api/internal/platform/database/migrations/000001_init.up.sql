CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id bigint,
    points_balance numeric(18,2) NOT NULL DEFAULT 100,
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

ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance numeric(18,2) NOT NULL DEFAULT 100;
CREATE SEQUENCE IF NOT EXISTS users_public_id_seq;
ALTER SEQUENCE users_public_id_seq OWNED BY users.public_id;
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('users_public_id_seq');
WITH base AS (
    SELECT coalesce(max(public_id), 0) AS maximum FROM users
), missing AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS position
    FROM users
    WHERE public_id IS NULL
)
UPDATE users
SET public_id = base.maximum + missing.position
FROM base, missing
WHERE users.id = missing.id;
SELECT setval('users_public_id_seq', greatest(coalesce((SELECT max(public_id) FROM users), 0) + 1, 1), false);
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users (public_id);

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
    CONSTRAINT media_assets_kind_check CHECK (kind IN ('image', 'video', 'audio')),
    CONSTRAINT media_assets_source_check CHECK (source IN ('generated', 'uploaded')),
    CONSTRAINT media_assets_status_check CHECK (status IN ('generating', 'ready', 'failed')),
    CONSTRAINT media_assets_size_check CHECK (size_bytes >= 0),
    CONSTRAINT media_assets_dimensions_check CHECK (width >= 0 AND height >= 0)
);

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'uploaded' CHECK (source IN ('generated', 'uploaded'));
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('image', 'video', 'audio'));

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
    CONSTRAINT generation_tasks_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS points_settings (
    id smallint PRIMARY KEY DEFAULT 1,
    initial_points numeric(18,2) NOT NULL DEFAULT 100,
    default_model_cost numeric(18,2) NOT NULL DEFAULT 1,
    image_quality_multipliers jsonb NOT NULL DEFAULT '{"1K":1,"2K":2}'::jsonb,
    video_quality_multipliers jsonb NOT NULL DEFAULT '{"480":1,"720":1.5,"1080":2}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT points_settings_singleton CHECK (id = 1),
    CONSTRAINT points_settings_values CHECK (initial_points >= 0 AND default_model_cost >= 0)
);

INSERT INTO points_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE points_settings DROP COLUMN IF EXISTS video_seconds_multipliers;

CREATE TABLE IF NOT EXISTS model_point_rules (
    model_id text PRIMARY KEY,
    cost numeric(18,2) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT model_point_rules_cost_check CHECK (cost >= 0)
);

CREATE TABLE IF NOT EXISTS point_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    type text NOT NULL,
    amount numeric(18,2) NOT NULL,
    balance_after numeric(18,2) NOT NULL,
    description text NOT NULL,
    model text,
    source_id text,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT point_transactions_type_check CHECK (type IN ('credit', 'consume', 'refund', 'adjustment')),
    CONSTRAINT point_transactions_balance_check CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS point_transactions_user_created_idx ON point_transactions (user_id, created_at DESC);

ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS points_cost numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS points_transaction_id uuid REFERENCES point_transactions(id) ON DELETE SET NULL;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS points_refunded boolean NOT NULL DEFAULT false;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS upstream_task_id text;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS upstream_query_path text;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS next_poll_at timestamptz;
ALTER TABLE generation_tasks DROP CONSTRAINT IF EXISTS generation_tasks_status_check;
ALTER TABLE generation_tasks ADD CONSTRAINT generation_tasks_status_check CHECK (status IN ('queued', 'running', 'needs_review', 'succeeded', 'failed', 'cancelled'));
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_status_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_status_check CHECK (status IN ('generating', 'needs_review', 'ready', 'failed'));

CREATE TABLE IF NOT EXISTS model_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    base_url text NOT NULL,
    protocol text NOT NULL DEFAULT 'openai',
    advanced_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    api_key_ciphertext text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    last_test_status text NOT NULL DEFAULT 'untested',
    last_test_message text NOT NULL DEFAULT '',
    last_tested_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT model_channels_protocol_check CHECK (protocol IN ('auto', 'openai', 'yumeng', 'gemini', 'sub2api', 'newapi', 'vozeb-recommended', 'globalaiopc', 'seedance', 'stable-diffusion', 'volcengine-video', 'seedance-special', 'compshare-minimax-h3', 'custom', 'compatible')),
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
	capability_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT channel_models_capability_check CHECK (capability IN ('text', 'image', 'video', 'audio')),
    CONSTRAINT channel_models_sort_order_check CHECK (sort_order >= 0)
);

DROP INDEX IF EXISTS channel_models_model_id_unique_lower;
CREATE UNIQUE INDEX IF NOT EXISTS channel_models_channel_model_unique_lower ON channel_models (channel_id, lower(model_id));
CREATE INDEX IF NOT EXISTS channel_models_channel_sort_idx ON channel_models (channel_id, sort_order ASC, created_at ASC);

ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES model_channels(id) ON DELETE SET NULL;

ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS advanced_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE model_channels DROP CONSTRAINT IF EXISTS model_channels_protocol_check;
ALTER TABLE model_channels ADD CONSTRAINT model_channels_protocol_check CHECK (protocol IN ('auto', 'openai', 'yumeng', 'gemini', 'sub2api', 'newapi', 'vozeb-recommended', 'globalaiopc', 'seedance', 'stable-diffusion', 'volcengine-video', 'seedance-special', 'compshare-minimax-h3', 'custom', 'compatible'));
ALTER TABLE channel_models DROP CONSTRAINT IF EXISTS channel_models_capability_check;
ALTER TABLE channel_models ADD COLUMN IF NOT EXISTS capability_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE channel_models ADD CONSTRAINT channel_models_capability_check CHECK (capability IN ('text', 'image', 'video', 'audio'));
DROP INDEX IF EXISTS channel_models_model_id_unique_lower;
CREATE UNIQUE INDEX IF NOT EXISTS channel_models_channel_model_unique_lower ON channel_models (channel_id, lower(model_id));

CREATE INDEX IF NOT EXISTS generation_tasks_status_created_idx ON generation_tasks (status, created_at ASC);
CREATE INDEX IF NOT EXISTS generation_tasks_user_created_idx ON generation_tasks (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS generation_tasks_request_slot_unique ON generation_tasks (user_id,(parameters->>'requestId'),((parameters->>'requestIndex')::integer)) WHERE parameters ? 'requestId';
CREATE INDEX IF NOT EXISTS generation_tasks_poll_idx ON generation_tasks (next_poll_at) WHERE status = 'running' AND upstream_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS generation_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
    attempt_no integer NOT NULL,
    channel_id uuid REFERENCES model_channels(id) ON DELETE SET NULL,
    protocol text NOT NULL DEFAULT '',
    request_path text NOT NULL DEFAULT '',
    status text NOT NULL,
    http_status integer,
    duration_ms bigint,
    error_message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (task_id, attempt_no),
    CONSTRAINT generation_attempts_status_check CHECK (status IN ('running', 'pending', 'succeeded', 'failed', 'unknown'))
);
ALTER TABLE generation_attempts DROP CONSTRAINT IF EXISTS generation_attempts_status_check;
ALTER TABLE generation_attempts ADD CONSTRAINT generation_attempts_status_check CHECK (status IN ('running', 'pending', 'succeeded', 'failed', 'unknown'));

ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 100;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS max_concurrency integer NOT NULL DEFAULT 4;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS request_timeout_seconds integer NOT NULL DEFAULT 300;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS failure_threshold integer NOT NULL DEFAULT 3;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 60;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS active_requests integer NOT NULL DEFAULT 0;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS last_runtime_error text NOT NULL DEFAULT '';
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS last_runtime_at timestamptz;
ALTER TABLE model_channels ADD COLUMN IF NOT EXISTS last_latency_ms bigint;
ALTER TABLE model_channels DROP CONSTRAINT IF EXISTS model_channels_protocol_check;
ALTER TABLE model_channels ADD CONSTRAINT model_channels_protocol_check CHECK (protocol IN ('auto', 'openai', 'yumeng', 'gemini', 'sub2api', 'newapi', 'vozeb-recommended', 'globalaiopc', 'seedance', 'stable-diffusion', 'volcengine-video', 'seedance-special', 'compshare-minimax-h3', 'custom', 'compatible'));
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS concurrency_at_start integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS generation_attempts_task_created_idx ON generation_attempts (task_id, attempt_no);
UPDATE model_channels SET active_requests = 0 WHERE active_requests <> 0;

UPDATE channel_models model SET capability_config='{"ratios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"qualities":["480P","768P","1080P","2K","4K"],"minDuration":4,"maxDuration":30,"modes":["text","frames","reference"],"supportsSound":true,"supportsWatermark":true}'::jsonb
FROM model_channels channel WHERE channel.id=model.channel_id AND channel.protocol='compshare-minimax-h3' AND model.capability='video' AND model.capability_config='{}'::jsonb;

UPDATE generation_tasks
SET status='running',next_poll_at=now(),review_reason=NULL,error_message=NULL
WHERE kind='video' AND status='needs_review' AND upstream_task_id IS NOT NULL AND upstream_task_id<>'' AND channel_id IS NOT NULL;
UPDATE media_assets asset SET status='generating',error_message=NULL
FROM generation_tasks task WHERE task.asset_id=asset.id AND task.kind='video' AND task.status='running' AND task.upstream_task_id IS NOT NULL AND asset.status='needs_review';

CREATE INDEX IF NOT EXISTS media_assets_user_created_idx ON media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_user_kind_created_idx ON media_assets (user_id, kind, created_at DESC);
