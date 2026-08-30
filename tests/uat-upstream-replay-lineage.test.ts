import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const reader=readFileSync("worker/uatUpstreamReplayLineage.ts","utf8");
const provisioner=readFileSync("worker/uatMultiEquipmentProvisioner.ts","utf8");
const migration=readFileSync("supabase/migrations/20260830000700_isolated_uat_upstream_replay_lineage_read.sql","utf8");
const lifecycle=readFileSync("supabase/migrations/20260830000800_fix_uat_failed_claim_resume_and_rental_b_lineage.sql","utf8");
describe("canonical upstream replay safety",()=>{
 it("uses one sanitized RPC reader",()=>{expect(reader).toContain("inspect_isolated_uat_upstream_replay_lineage"); expect(reader).toContain("READ_FAILED"); expect(reader).toContain("BUSINESS_DUPLICATE");});
 it("preflights before any upstream mutation and conditionally reuses",()=>{expect(provisioner).toContain("readUatUpstreamReplayLineage"); expect(provisioner).toContain('upstream.decision!=="SAFE"'); expect(provisioner).toContain('classification==="ABSENT"');});
 it("uses the service-role read client for Rental A lineage",()=>{expect(provisioner).toContain("reservePrepareReleaseActivate(user,service,"); expect(provisioner).toContain("readUatPartialRentalLineage(readClient,");});
 it("keeps the RPC service-role-only and read-only",()=>{expect(migration).toContain("SECURITY DEFINER"); expect(migration).toContain("REVOKE ALL ON FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(jsonb) FROM PUBLIC,anon,authenticated"); expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_upstream_replay_lineage(jsonb) TO service_role"); expect(migration).not.toMatch(/INSERT INTO|UPDATE erp\.|DELETE FROM/);});
 it("reopens only failed residue under the canonical claim and supports Rental B lineage",()=>{expect(lifecycle).toContain("IF existing.state='FAILED'"); expect(lifecycle).toContain("SET state='PROVISIONING'"); expect(lifecycle).toContain("rental_id NOT IN (residue.scenario->>'rentalAId',residue.scenario->>'rentalBId')"); expect(provisioner).toContain('scenario.rentalBId,[scenario.rentalBLineId],[2],true');});
});
