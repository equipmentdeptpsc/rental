import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260803006400_phase_c12_grouped_review_retry_cleanup_expansion.sql","utf8");
const previous=readFileSync("supabase/migrations/20260803006300_phase_c12_grouped_review_atomic_delivery_envelope.sql","utf8");

describe("C12 grouped review retry cleanup expansion",()=>{
  it("changes only the exact attempt maximum from one to two",()=>{
    expect(migration).toContain("notification_delivery_attempts WHERE company_id=target_tenant_id)>1");
    expect(migration).toContain("notification_delivery_attempts WHERE company_id=target_tenant_id)>2");
    expect(migration).not.toMatch(/>3|replace\([^;]*notification_outbox/s);
  });
  it("preserves the exact secured cleanup and envelope dependency order",()=>{
    for(const marker of ["cleanup_c12_grouped_customer_review_fixture(text,text,text)","OWNER TO postgres","FROM PUBLIC,anon,authenticated,service_role","DELETE FROM notification_delivery_envelopes e USING notification_outbox n"]) expect(migration).toContain(marker);
    expect(previous.indexOf("DELETE FROM notification_delivery_envelopes e USING notification_outbox n")).toBeLessThan(previous.lastIndexOf("DELETE FROM notification_outbox WHERE company_id=target_tenant_id"));
    expect(migration).not.toMatch(/auth\.users|session_replication_role|DISABLE TRIGGER|DISABLE CONSTRAINT/i);
  });
});
