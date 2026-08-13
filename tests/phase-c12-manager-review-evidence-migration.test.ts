import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20260803005200_phase_c12_manager_review_evidence.sql","utf8");
describe("Phase C12 Manager immutable evidence",()=>{
 it("freezes canonical operational evidence only",()=>{for(const field of ["companyName","customerName","assetNumber","shiftStart","shiftEnd","customerDecision"])expect(sql).toContain(`'${field}'`);expect(sql).toContain("rental_record.customer_snapshot");expect(sql).toContain("equipment_record.asset_no");expect(sql).not.toMatch(/'billingMethod'|'unitRate'|'contractAmount'/)});
 it("requires exact tenant, line, revision, shift, and acknowledgement",()=>{for(const value of ["company_id=target_company_id","rental_equipment_line_id=target_line_id","outcome.revision_id=target_deur_id","starts<>1 OR ends<>1","decisions<>1","decision.action IS DISTINCT FROM 'ACKNOWLEDGE'"])expect(sql).toContain(value)});
 it("rejects caller evidence through the unchanged allowlist",()=>{expect(sql).toContain("command_create_manager_review_request");expect(sql).toContain("unexpected manager issuance definition");for(const field of ["companyName","customerName","assetNumber"])expect(sql).not.toContain(`key IN('${field}')`)});
 it("preserves least privilege and explicit search paths",()=>{expect(sql).toContain("SECURITY DEFINER SET search_path=erp,pg_catalog");expect(sql).toContain("OWNER TO postgres");expect(sql).toContain("GRANT EXECUTE ON FUNCTION get_manager_review(jsonb) TO anon");expect(sql).toContain("REVOKE ALL ON FUNCTION decide_manager_review(jsonb,text)")});
});
