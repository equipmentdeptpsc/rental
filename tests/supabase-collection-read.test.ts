import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SupabaseCollectionReadRepository } from "@/integrations/supabase/SupabaseCollectionReadRepository";
import { reconcileStatementCollections } from "@/features/rental/collections/collectionService";

const migration = readFileSync("supabase/migrations/20261004000300_canonical_collection_tenant_read_projection.sql", "utf8");
const rentalId = "fe225d54-5aec-42ab-b1e1-9ae731409e56";
const row = { id: "collection-1", billing_statement_id: "b0e9fba1-b9ff-48bc-9b3e-b3be4da0fb15", rental_id: rentalId, amount: 250, collected_at: "2026-10-04T00:00:00.000Z", reference_no: "RCPT-1", created_by: "user-1", created_at: "2026-10-04T00:00:00.000Z" };

function repository(response: unknown[] | null, error: unknown = null) {
  const rpc = async (_name: string, _args: Record<string, unknown>) => ({ data: response, error });
  return new SupabaseCollectionReadRepository({ schema: () => ({ rpc }) } as never);
}

describe("canonical remote collection reads", () => {
  it("returns a successful empty collection projection for the scoped rental", async () => {
    const result = await repository([]).list({ filters: { rental_id: rentalId } });
    expect(result).toEqual({ success: true, value: { items: [] } });
  });

  it("maps a partial collection and preserves invoice reconciliation", async () => {
    const result = await repository([row]).list({ filters: { rental_id: rentalId } });
    expect(result).toMatchObject({ success: true, value: { items: [{ rentalId, amount: 250, referenceNumber: "RCPT-1" }] } });
    if (!result.success) throw new Error("expected collection read success");
    expect(reconcileStatementCollections({ id: row.billing_statement_id, grandTotal: 1000 } as never, result.value.items)).toEqual({ invoiceTotal: 1000, totalCollected: 250, outstandingBalance: 750 });
  });

  it("fails closed for unscoped and remote-error reads", async () => {
    await expect(repository([]).list()).resolves.toMatchObject({ success: false, error: { code: "REPOSITORY_QUERY_FAILED" } });
    await expect(repository(null, { code: "42501" }).list({ filters: { rental_id: rentalId } })).resolves.toMatchObject({ success: false, error: { code: "REMOTE_READ_FAILED" } });
  });

  it("uses a tenant-scoped read-only RPC and no direct browser table grant", () => {
    expect(migration).toContain("RETURNS SETOF erp.collections");
    expect(migration).toContain("collection_row.company_id = erp.current_company_id()");
    expect(migration).toContain("auth.uid() IS NOT NULL");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.read_collections_for_rental(text) TO authenticated");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, service_role/);
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });
});
