import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260802003400_phase_c7_realtime_publication.sql"),
  "utf8",
);

describe("Phase C7 Realtime publication migration", () => {
  it("publishes only the operational event stream and is idempotent", () => {
    expect(migration).toContain("pg_publication_tables");
    expect(migration).toContain("pubname = 'supabase_realtime'");
    expect(migration).toContain("schemaname = 'erp'");
    expect(migration).toContain("tablename = 'deur_events'");
    expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE erp.deur_events");
    expect(migration.match(/ADD TABLE/g)).toHaveLength(1);
  });

  it("does not weaken RLS, grants, triggers, or write boundaries", () => {
    expect(migration).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toMatch(/CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY/i);
    expect(migration).not.toMatch(/GRANT\s+/i);
    expect(migration).not.toMatch(/DISABLE\s+TRIGGER|session_replication_role/i);
    expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT)\s+(INTO|erp\.)/i);
  });
});
