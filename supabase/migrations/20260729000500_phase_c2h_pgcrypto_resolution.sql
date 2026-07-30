BEGIN;
SET search_path TO erp, public;

-- Phase C1 is already applied. Recreate only the latent PL/pgSQL hash helper
-- so runtime resolution does not depend on a caller-controlled search_path.
CREATE OR REPLACE FUNCTION begin_deur_command(command jsonb, command_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=erp,public,auth AS $$
DECLARE existing deur_command_idempotency; payload_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||coalesce(command->>'idempotencyKey',''),0));
  payload_hash=pg_catalog.encode(
    extensions.digest((command-'idempotencyKey'-'commandId')::text,'sha256'),
    'hex'
  );
  SELECT * INTO existing
  FROM deur_command_idempotency
  WHERE actor_id=auth.uid() AND idempotency_key=command->>'idempotencyKey'
  FOR UPDATE;
  IF existing.id IS NULL THEN
    RETURN jsonb_build_object('state','NEW','payloadHash',payload_hash);
  END IF;
  IF existing.command_type<>command_type OR existing.payload_hash<>payload_hash THEN
    RETURN jsonb_build_object('state','MISMATCH');
  END IF;
  RETURN jsonb_build_object('state','REPLAY','response',existing.response);
END $$;

REVOKE ALL ON FUNCTION begin_deur_command(jsonb,text) FROM PUBLIC,anon,authenticated;

COMMIT;
