BEGIN;

CREATE TABLE IF NOT EXISTS deur_sync_accepted_operations (
  operation_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  entity_id text NOT NULL,
  operation_type text NOT NULL,
  remote_revision bigint NOT NULL CHECK (remote_revision > 0),
  schema_version integer NOT NULL,
  accepted_evidence jsonb NOT NULL,
  acceptance_timestamp timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS deur_sync_entity_state (
  entity_id text PRIMARY KEY,
  remote_revision bigint NOT NULL CHECK (remote_revision > 0),
  latest_envelope jsonb NOT NULL,
  updated_timestamp timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS deur_sync_change_log (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id text NOT NULL,
  operation_id text NOT NULL UNIQUE REFERENCES deur_sync_accepted_operations(operation_id),
  remote_revision bigint NOT NULL CHECK (remote_revision > 0),
  envelope jsonb NOT NULL,
  created_timestamp timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS deur_sync_change_log_entity_sequence_idx
  ON deur_sync_change_log (entity_id, sequence);

CREATE TABLE IF NOT EXISTS deur_sync_conflicts (
  conflict_id text PRIMARY KEY,
  entity_id text NOT NULL,
  classification text NOT NULL,
  local_envelope jsonb NOT NULL,
  remote_envelope jsonb NOT NULL,
  conflict_evidence jsonb NOT NULL,
  detection_timestamp timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolution_status text NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'resolved')),
  resolved_timestamp timestamptz,
  resolution_metadata jsonb
);

CREATE INDEX IF NOT EXISTS deur_sync_conflicts_entity_status_idx
  ON deur_sync_conflicts (entity_id, resolution_status);

COMMIT;
