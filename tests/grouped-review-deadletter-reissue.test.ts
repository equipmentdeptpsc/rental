import{readFileSync}from"node:fs";
import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260826000500_grouped_review_deadletter_reissue.sql","utf8");
describe("grouped-review terminal delivery recovery",()=>{
 it("retains terminal history while permitting only one live replacement",()=>{expect(sql).toContain("status NOT IN('DeadLetter','FailedCredentialLost','Cancelled','Superseded')");expect(sql).toContain("old_intent.status<>'DeadLetter'");expect(sql).not.toMatch(/DELETE FROM erp\.(?:notification|customer_review)/);});
 it("is service-only and exact-UAT bounded",()=>{expect(sql).toContain("auth.role()<>'service_role'");expect(sql).toContain("old_intent.company_id<>'TENANT-LOCAL-001'");expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.trusted_reissue_grouped_review_deadletter(jsonb) TO service_role");expect(sql).not.toMatch(/TO authenticated/);});
 it("keeps one batch and request while rotating only credential and envelope",()=>{expect(sql).toContain("UPDATE erp.customer_review_batches SET credential_hash");expect(sql).toContain("INSERT INTO erp.notification_delivery_envelopes");expect(sql).not.toMatch(/INSERT INTO erp\.customer_review_(?:batches|batch_items|requests)/);});
 it("requires one item, no prior acceptance, and replay-safe identity",()=>{expect(sql).toContain("count(*) FROM erp.customer_review_batch_items");expect(sql).toContain("status='ProviderAccepted'");expect(sql).toContain("'disposition','REPLAYED'");});
 it("persists safe UAT override evidence through canonical completion",()=>{expect(sql).toContain("complete_grouped_review_notification_delivery");expect(sql).toContain("uat_override_applied=coalesce");});
});
