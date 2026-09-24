CREATE TABLE owners (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  token_digest text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_owner_active_idx ON sessions(owner_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE n8n_providers (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  name text NOT NULL,
  base_url text NOT NULL,
  encrypted_api_key text NOT NULL,
  status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, base_url)
);

CREATE TABLE workflows (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES n8n_providers(id) ON DELETE RESTRICT,
  provider_workflow_id text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  sanitized_definition jsonb NOT NULL,
  privacy_mode text NOT NULL CHECK (privacy_mode = 'sanitized_only'),
  sanitizer_version text NOT NULL,
  content_digest text NOT NULL,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, provider_workflow_id)
);
CREATE INDEX workflows_provider_updated_idx ON workflows(provider_id, updated_at DESC);

CREATE TABLE executions (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES n8n_providers(id) ON DELETE RESTRICT,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  provider_execution_id text NOT NULL,
  status text NOT NULL,
  mode text,
  started_at timestamptz,
  stopped_at timestamptz,
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  sanitized_content jsonb NOT NULL,
  privacy_mode text NOT NULL CHECK (privacy_mode = 'sanitized_only'),
  sanitizer_version text NOT NULL,
  content_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, provider_execution_id)
);
CREATE INDEX executions_provider_started_idx ON executions(provider_id, started_at DESC);
CREATE INDEX executions_workflow_started_idx ON executions(workflow_id, started_at DESC);

CREATE TABLE sync_cursors (
  provider_id uuid NOT NULL REFERENCES n8n_providers(id) ON DELETE RESTRICT,
  sync_kind text NOT NULL,
  cursor text,
  last_synced_at timestamptz NOT NULL,
  PRIMARY KEY(provider_id, sync_kind)
);

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES n8n_providers(id) ON DELETE RESTRICT,
  sync_kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  records_processed integer NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL
);
CREATE INDEX sync_runs_provider_started_idx ON sync_runs(provider_id, started_at DESC);
