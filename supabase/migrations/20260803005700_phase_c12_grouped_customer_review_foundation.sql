BEGIN;
SET search_path = erp, pg_catalog;

-- Supporting identities let the grouped envelope prove its complete canonical
-- parent chain without weakening any existing per-DEUR review cardinality.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rentals_grouped_review_identity
  ON erp.rentals(company_id, id, customer_id, project_id, timezone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_lines_grouped_review_identity
  ON erp.rental_equipment_lines(company_id, id, rental_id, equipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deurs_grouped_review_identity
  ON erp.deurs(company_id, id, rental_id, rental_equipment_line_id, equipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_review_requests_grouped_identity
  ON erp.customer_review_requests(
    company_id, id, rental_id, rental_equipment_line_id, deur_id, revision_id
  );

CREATE TABLE erp.customer_review_batches (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_id text NOT NULL,
  customer_id text NOT NULL,
  project_id text NOT NULL,
  rental_id text NOT NULL,
  review_date date NOT NULL,
  business_timezone text NOT NULL,
  credential_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz,
  superseded_by_batch_id uuid,
  summary_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT customer_review_batches_company_fk
    FOREIGN KEY(company_id) REFERENCES erp.companies(id),
  CONSTRAINT customer_review_batches_customer_fk
    FOREIGN KEY(company_id, customer_id) REFERENCES erp.customers(company_id, id),
  CONSTRAINT customer_review_batches_project_fk
    FOREIGN KEY(company_id, project_id) REFERENCES erp.projects(company_id, id),
  CONSTRAINT customer_review_batches_rental_context_fk
    FOREIGN KEY(company_id, rental_id, customer_id, project_id, business_timezone)
    REFERENCES erp.rentals(company_id, id, customer_id, project_id, timezone),
  CONSTRAINT customer_review_batches_credential_hash_check CHECK (
    credential_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT customer_review_batches_timezone_check CHECK (
    length(btrim(business_timezone)) BETWEEN 1 AND 100
  ),
  CONSTRAINT customer_review_batches_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT customer_review_batches_snapshot_check CHECK (
    jsonb_typeof(summary_snapshot) = 'object'
    AND NOT summary_snapshot ?| ARRAY[
      'companyId','tenantId','credential','credentialHash','token','tokenHash',
      'commandId','idempotencyKey'
    ]
  ),
  CONSTRAINT customer_review_batches_supersession_check CHECK (
    (superseded_at IS NULL AND superseded_by_batch_id IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by_batch_id IS NOT NULL)
  ),
  CONSTRAINT customer_review_batches_superseded_by_fk
    FOREIGN KEY(superseded_by_batch_id) REFERENCES erp.customer_review_batches(id),
  CONSTRAINT customer_review_batches_self_supersession_check CHECK (
    superseded_by_batch_id IS NULL OR superseded_by_batch_id <> id
  ),
  CONSTRAINT customer_review_batches_context_identity
    UNIQUE(id, company_id, customer_id, project_id, rental_id)
);

CREATE UNIQUE INDEX uq_customer_review_batches_current_group_date
  ON erp.customer_review_batches(
    company_id, customer_id, project_id, rental_id, review_date
  ) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX uq_customer_review_batches_credential_hash
  ON erp.customer_review_batches(credential_hash);
CREATE INDEX ix_customer_review_batches_rental_date
  ON erp.customer_review_batches(company_id, rental_id, review_date DESC);

CREATE TABLE erp.customer_review_batch_items (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  batch_id uuid NOT NULL,
  company_id text NOT NULL,
  customer_id text NOT NULL,
  project_id text NOT NULL,
  rental_id text NOT NULL,
  rental_equipment_line_id text NOT NULL,
  equipment_id text NOT NULL,
  operator_id text,
  deur_id text,
  revision_id text,
  customer_review_request_id uuid,
  item_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT customer_review_batch_items_batch_context_fk
    FOREIGN KEY(batch_id, company_id, customer_id, project_id, rental_id)
    REFERENCES erp.customer_review_batches(id, company_id, customer_id, project_id, rental_id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_review_batch_items_line_fk
    FOREIGN KEY(company_id, rental_equipment_line_id, rental_id, equipment_id)
    REFERENCES erp.rental_equipment_lines(company_id, id, rental_id, equipment_id),
  CONSTRAINT customer_review_batch_items_equipment_fk
    FOREIGN KEY(company_id, equipment_id) REFERENCES erp.equipment(company_id, id),
  CONSTRAINT customer_review_batch_items_operator_fk
    FOREIGN KEY(company_id, operator_id) REFERENCES erp.operators(company_id, id),
  CONSTRAINT customer_review_batch_items_deur_fk
    FOREIGN KEY(company_id, deur_id, rental_id, rental_equipment_line_id, equipment_id)
    REFERENCES erp.deurs(company_id, id, rental_id, rental_equipment_line_id, equipment_id),
  CONSTRAINT customer_review_batch_items_revision_fk
    FOREIGN KEY(company_id, revision_id) REFERENCES erp.deurs(company_id, id),
  CONSTRAINT customer_review_batch_items_request_fk
    FOREIGN KEY(
      company_id, customer_review_request_id, rental_id,
      rental_equipment_line_id, deur_id, revision_id
    ) REFERENCES erp.customer_review_requests(
      company_id, id, rental_id, rental_equipment_line_id, deur_id, revision_id
    ),
  CONSTRAINT customer_review_batch_items_revision_identity_check CHECK (
    (deur_id IS NULL AND revision_id IS NULL AND customer_review_request_id IS NULL)
    OR (deur_id IS NOT NULL AND revision_id = deur_id)
  ),
  CONSTRAINT customer_review_batch_items_snapshot_check CHECK (
    jsonb_typeof(item_snapshot) = 'object'
    AND item_snapshot ? 'equipmentName'
    AND item_snapshot ? 'assetNumber'
    AND item_snapshot ? 'reviewState'
    AND NOT item_snapshot ?| ARRAY[
      'companyId','tenantId','credential','credentialHash','token','tokenHash',
      'commandId','idempotencyKey'
    ]
  )
);

CREATE UNIQUE INDEX uq_customer_review_batch_items_line_revision
  ON erp.customer_review_batch_items(
    batch_id, rental_equipment_line_id, coalesce(revision_id, '')
  );
CREATE INDEX ix_customer_review_batch_items_request
  ON erp.customer_review_batch_items(customer_review_request_id)
  WHERE customer_review_request_id IS NOT NULL;
CREATE INDEX ix_customer_review_batch_items_batch
  ON erp.customer_review_batch_items(batch_id, created_at, id);

ALTER TABLE erp.customer_review_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.customer_review_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.customer_review_batches OWNER TO postgres;
ALTER TABLE erp.customer_review_batch_items OWNER TO postgres;

REVOKE ALL ON TABLE erp.customer_review_batches
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE erp.customer_review_batch_items
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE erp.customer_review_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE erp.customer_review_batch_items TO service_role;

COMMENT ON TABLE erp.customer_review_batches IS
  'Provider-neutral grouped Customer Review access envelope. The raw credential is never persisted; status is projected from item/request evidence. review_date is derived from rentals.timezone by a future trusted generator.';
COMMENT ON TABLE erp.customer_review_batch_items IS
  'Immutable-intent line evidence association. One existing per-DEUR request may appear in multiple date-specific batches for reminders; finalization immutability is added with the trusted generation boundary.';
COMMENT ON COLUMN erp.customer_review_batches.business_timezone IS
  'Exact rentals.timezone captured for business-date authority. Future generation must validate it as an IANA timezone and must not fall back to UTC.';
COMMENT ON COLUMN erp.customer_review_batches.credential_hash IS
  'SHA-256 hex digest of the reusable batch access credential; raw credential storage is forbidden.';

COMMIT;
