import { describe, expect, it } from "vitest";
import { mapDeur } from "@/integrations/supabase/readRepositories";

describe("certified DEUR read projection", () => {
  it("retains logical event order and removes only superseded raw events", () => {
    const result = mapDeur({
      id: "deur-1", rental_id: "rental-1", equipment_id: "equipment-1", operator_id: "operator-1",
      work_date: "2026-10-01", status: "In Progress", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
      deur_events: [
        { id: "end", activity_type: "shift", action: "end", occurred_at: "2026-10-01T09:00:00Z", sequence: 3, deur_event_supersessions: [] },
        { id: "old", activity_type: "shift", action: "start", occurred_at: "2026-10-01T00:00:00Z", sequence: 1, deur_event_supersessions: [{ id: "supersession" }] },
        { id: "start", activity_type: "shift", action: "start", occurred_at: "2026-10-01T01:00:00Z", sequence: 2, deur_event_supersessions: [] },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.events?.map((event) => event.id)).toEqual(["start", "end"]);
  });
});
