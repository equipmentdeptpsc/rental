BEGIN;
SET search_path TO erp, public;

CREATE TABLE migration_import_batches (
  id text PRIMARY KEY, manifest_version integer NOT NULL, application_schema_version integer NOT NULL,
  source_application_version text NOT NULL, repository_catalog_version integer NOT NULL,
  exported_at timestamptz NOT NULL, manifest_checksum text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Staged', created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, approved_by text,
  CONSTRAINT ck_import_batch_status CHECK(status IN ('Staged','Validated','Rejected','Approved','Imported','Reconciled'))
);

CREATE TABLE migration_staging_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id text NOT NULL REFERENCES migration_import_batches(id) ON DELETE RESTRICT,
  source_repository text NOT NULL, source_storage_key text NOT NULL, source_record_id text,
  source_schema_version integer NOT NULL, dependency_order integer NOT NULL, raw_payload jsonb NOT NULL,
  source_checksum text NOT NULL, validation_status text NOT NULL DEFAULT 'Pending', transformation_status text NOT NULL DEFAULT 'Pending',
  import_error_code text, import_error_details jsonb, imported_table text, imported_record_id text,
  staged_at timestamptz NOT NULL DEFAULT now(), validated_at timestamptz, transformed_at timestamptz, imported_at timestamptz,
  CONSTRAINT ck_staging_validation CHECK(validation_status IN ('Pending','Valid','Invalid','Warning')),
  CONSTRAINT ck_staging_transformation CHECK(transformation_status IN ('Pending','Ready','Blocked','Imported')),
  CONSTRAINT ck_staging_error CHECK((import_error_code IS NULL) = (import_error_details IS NULL)),
  UNIQUE(batch_id,source_repository,source_record_id)
);

CREATE INDEX ix_staging_batch_dependency ON migration_staging_records(batch_id,dependency_order,source_repository);
CREATE INDEX ix_staging_unresolved ON migration_staging_records(batch_id,validation_status,transformation_status)
  WHERE validation_status <> 'Valid' OR transformation_status NOT IN ('Ready','Imported');

COMMIT;
