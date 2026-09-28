import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260929000700_manual_deur_submit_bootstrap_guard.sql"),
  "utf8",
);

describe("manual DEUR correction submission bootstrap guard", () => {
  it("ignores only the synthetic bootstrap open marker", () => {
    expect(migration).toContain("command_submit_deur");
    expect(migration).toContain("is_open AND NOT erp.is_manual_deur_encoding_bootstrap_event(current_deur,event_record)");
    expect(migration).toContain("Real open activity events still");
  });

  it("is forward-only and does not mutate business rows", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+erp\.(deurs|deur_events|customer_review_requests)/i);
    expect(migration).not.toMatch(/UPDATE\s+erp\.(deurs|deur_events|customer_review_requests)/i);
    expect(migration).not.toContain("DROP FUNCTION");
  });
});
