import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapDeur } from "@/integrations/supabase/readRepositories";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260930000500_manual_deur_supersession_read_policy.sql"), "utf8");

describe("manual DEUR supersession read policy", () => {
  it("uses the authenticated tenant-read helper without exposing current_company_id", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS deur_event_supersessions_select_same_company");
    expect(migration).toContain("USING (erp.can_read_company_row(company_id))");
    expect(migration).not.toContain("erp.current_company_id()");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION erp.current_company_id");
    expect(migration).not.toMatch(/INSERT|UPDATE|DELETE/i);
  });

  it("excludes only a superseded raw event from the operational projection", () => {
    const result = mapDeur({
      id: "deur-1", rental_id: "rental-1", equipment_id: "equipment-1", operator_id: "operator-1",
      work_date: "2026-09-29", status: "In Progress", created_at: "2026-09-29T00:00:00Z", updated_at: "2026-09-29T00:00:00Z",
      deur_events: [
        { id: "superseded", deur_id: "deur-1", activity_type: "shift", action: "start", occurred_at: "2026-09-29T02:33:58Z", sequence: 1, source: "manual-web", deur_event_supersessions: [{ id: "link-1" }] },
        { id: "replacement", deur_id: "deur-1", activity_type: "shift", action: "start", occurred_at: "2026-09-28T08:00:00Z", sequence: 5, source: "manual-web", deur_event_supersessions: [] },
      ],
    });
    expect(result).toMatchObject({ success: true, value: { events: [{ id: "replacement", sequence: 5 }] } });
  });
});
