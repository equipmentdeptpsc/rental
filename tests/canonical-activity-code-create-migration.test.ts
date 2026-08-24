import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260823000400_canonical_activity_code_create.sql","utf8");

describe("canonical Activity Code create migration",()=>{
  it("maps activity_code.create only to System Administrator",()=>{
    expect(sql).toContain("'activity_code.create'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).toMatch(/DELETE FROM erp\.role_permissions[\s\S]*r\.code<>'system-administrator'/);
  });
  it("accepts only the narrow canonical input contract",()=>{
    expect(sql).toContain("key NOT IN('commandId','idempotencyKey','activityCodeId','code','name','sortOrder')");
    for(const rejected of ["companyId","projectId","defaultRate","unit","remarks","legacy_payload"]){
      expect(sql).not.toContain(`key NOT IN(${rejected}`);
    }
    expect(sql).toContain("activity_code_id_value !~*");
    expect(sql).toContain("jsonb_typeof(command->'sortOrder')<>'number'");
  });
  it("forces canonical state and preserves global catalog semantics",()=>{
    expect(sql).toContain("erp.activity_codes(id,code,name,active,sort_order,deleted_at,row_version)");
    expect(sql).toContain("VALUES(activity_code_id_value,code_value,name_value,true,sort_order_value,NULL,1)");
    expect(sql).not.toMatch(/INSERT INTO erp\.activity_codes[\s\S]{0,200}(?:company_id|project_id)/i);
  });
  it("uses approved idempotency, audit, and safe conflict boundaries",()=>{
    for(const marker of ["begin_operational_command","finish_operational_command","CREATE_ACTIVITY_CODE","ACTIVITY_CODE_CREATED","ACTIVITY_CODE_CONFLICT","ACTIVITY_CODE_ID_CONFLICT","IDEMPOTENCY_MISMATCH"]){
      expect(sql).toContain(marker);
    }
  });
  it("keeps the RPC authenticated-only and direct DML denied",()=>{
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.activity_codes FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*erp\.activity_codes/i);
  });
});
