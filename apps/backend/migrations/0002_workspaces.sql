-- Preserve owners and sessions as user identities. Existing providers retain their owner
-- and are assigned to a dedicated legacy workspace for that owner, never by owner_id aliasing.
ALTER TABLE owners ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'super_admin'));
CREATE UNIQUE INDEX owners_single_super_admin_idx ON owners(role) WHERE role = 'super_admin';

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO workspaces (id, name, created_by)
SELECT gen_random_uuid(), 'Original workspace', id FROM owners;
ALTER TABLE sessions ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
UPDATE sessions s SET workspace_id = (
  SELECT w.id FROM workspaces w WHERE w.created_by = s.owner_id ORDER BY w.created_at, w.id LIMIT 1
);
ALTER TABLE n8n_providers ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT;
UPDATE n8n_providers p SET workspace_id = (
  SELECT w.id FROM workspaces w WHERE w.created_by = p.owner_id ORDER BY w.created_at, w.id LIMIT 1
);
ALTER TABLE n8n_providers ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE n8n_providers DROP CONSTRAINT n8n_providers_owner_id_base_url_key;
ALTER TABLE n8n_providers ADD CONSTRAINT n8n_providers_workspace_base_url_key UNIQUE(workspace_id, base_url);
CREATE INDEX n8n_providers_workspace_idx ON n8n_providers(workspace_id);
