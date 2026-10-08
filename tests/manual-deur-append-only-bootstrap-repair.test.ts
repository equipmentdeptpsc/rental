import { expect, it, describe } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260930000400_manual_deur_append_only_bootstrap_repair.sql"),"utf8");
const readRepository=readFileSync(resolve(process.cwd(),"src/integrations/supabase/readRepositories.ts"),"utf8");

describe("manual DEUR append-only bootstrap repair preparation",()=>{
  it("preserves immutable raw history and represents repair as a unique supersession",()=>{
    expect(migration).toContain("CREATE TABLE erp.deur_event_supersessions");
    expect(migration).toContain("UNIQUE (original_event_id)");
    expect(migration).toContain("UNIQUE (replacement_event_id)");
    expect(migration).toContain("validate_deur_event_supersession_scope");
    expect(migration).toContain("original_event.company_id<>NEW.company_id");
    expect(migration).toContain("original_event.deur_id<>replacement_event.deur_id");
    expect(migration).toContain("deur_event_supersessions_immutable");
    expect(migration).toContain("effective_deur_events");
  });
  it("derives occurrence time from the rejected source rather than browser input",()=>{
    expect(migration).toContain("source_event.occurred_at");
    expect(migration).not.toContain("command->>'clientOccurredAt'");
    expect(migration).toContain("MANUAL_CORRECTION_BOOTSTRAP_OCCURRENCE");
  });
  it("does not weaken or remove immutable history protections",()=>{
    expect(migration).not.toContain("DROP TRIGGER deur_events_immutable");
    expect(migration).not.toContain("ALTER TABLE erp.deur_events DISABLE TRIGGER");
    expect(migration).not.toContain("DELETE FROM erp.deur_events");
  });
  it("keeps raw superseded evidence out of the effective UI projection",()=>{
    expect(readRepository).toContain("deur_event_supersessions!deur_event_supersessions_original_event_id_fkey");
    expect(readRepository).toContain("superseded:outgoing.length>0");
  });
  it("uses the effective relation for all operational state consumers",()=>{
    expect(migration).toContain("FROM erp.effective_deur_events(target.id) e");
    expect(migration).toContain("FROM erp.effective_deur_events(target.id) later_start");
    expect(migration).toContain("FROM erp.effective_deur_events(current_deur.id) event_record");
    expect(migration).toContain("FROM erp.effective_deur_events(target_deur_id)");
  });
});
