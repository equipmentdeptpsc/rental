import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261003000700_canonical_remote_collection_workflow.sql", "utf8");
const commands = readFileSync("src/integrations/supabase/SupabaseOperationalCommandRepository.ts", "utf8");
const provider = readFileSync("src/features/rental/workspace/RentalWorkspaceProvider.tsx", "utf8");
const page = readFileSync("src/pages/Billing/index.tsx", "utf8");

describe("canonical remote collection workflow", () => {
  it("uses a tenant-safe atomic command with idempotency, version, duplicate reference, audit, and balance guards", () => {
    expect(migration).toContain("command_record_collection");
    expect(migration).toContain("collections.create");
    expect(migration).toContain("begin_operational_command");
    expect(migration).toContain("expectedVersion");
    expect(migration).toContain("lower(existing.reference_no)");
    expect(migration).toContain("RECORD_COLLECTION");
    expect(migration).toContain("greatest(coalesce(statement_row.grand_total, statement_row.subtotal) - collected_total, 0)");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON erp.collections");
  });

  it("exposes the command and reads collections from the remote canonical projection", () => {
    expect(commands).toContain('command_record_collection');
    expect(provider).toContain("readRepositories.collections.list");
    expect(provider).toContain("remoteCollections");
  });

  it("uses read repositories for global remote billing", () => {
    expect(page).toContain("readRepositories.billing.list");
    expect(page).toContain("readRepositories.rentals.list");
    expect(page).toContain("PersistenceMode.Remote");
  });
});
