import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260823000350_canonical_cost_code_create.sql","utf8");

describe("canonical Cost Code create migration",()=>{
  it("maps cost_code.create only to System Administrator",()=>{
    expect(sql).toContain("'cost_code.create'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).toMatch(/DELETE FROM erp\.role_permissions[\s\S]*r\.code<>'system-administrator'/);
  });
  it("accepts only the narrow canonical input contract",()=>{
    expect(sql).toContain("key NOT IN('commandId','idempotencyKey','costCodeId','code','name','sortOrder')");
    for(const rejected of ["companyId","defaultRate","unit","remarks","equipmentClassification","legacy_payload"]){
      expect(sql).not.toContain(`key NOT IN(${rejected}`);
    }
    expect(sql).toContain("cost_code_id_value !~*");
    expect(sql).toContain("jsonb_typeof(command->'sortOrder')<>'number'");
  });
  it("forces canonical state and preserves global catalog semantics",()=>{
    expect(sql).toContain("erp.cost_codes(id,code,name,active,sort_order,deleted_at,row_version)");
    expect(sql).toContain("VALUES(cost_code_id_value,code_value,name_value,true,sort_order_value,NULL,1)");
    expect(sql).not.toMatch(/INSERT INTO erp\.cost_codes[\s\S]{0,200}company_id/i);
  });
  it("uses approved idempotency, audit, and safe conflict boundaries",()=>{
    for(const marker of ["begin_operational_command","finish_operational_command","CREATE_COST_CODE","COST_CODE_CREATED","COST_CODE_CONFLICT","COST_CODE_ID_CONFLICT","IDEMPOTENCY_MISMATCH"]){
      expect(sql).toContain(marker);
    }
  });
  it("keeps the RPC authenticated-only and direct DML denied",()=>{
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.cost_codes FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*erp\.cost_codes/i);
  });
});
