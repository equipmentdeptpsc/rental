import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260823000550_canonical_work_description_create.sql","utf8");

describe("canonical Work Description create migration",()=>{
  it("authorizes only System Administrator with a dedicated permission",()=>{
    expect(sql).toContain("'work_description.create'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).toMatch(/DELETE FROM erp\.role_permissions[\s\S]*r\.code<>'system-administrator'/);
    expect(sql).not.toContain("'masterData.manage'");
  });
  it("uses a strict global business input contract",()=>{
    expect(sql).toContain("key NOT IN('commandId','idempotencyKey','workDescriptionId','code','name','requiresRemarks','sortOrder')");
    const allowList=sql.match(/key NOT IN\(([^)]+)\)/)?.[1] ?? "";
    for(const field of ["companyId","actorId","active","deletedAt","rowVersion","costCodeId","activityCodeId"]) expect(allowList).not.toContain(`'${field}'`);
    expect(sql).toContain("work_description_id_value !~*");
  });
  it("normalizes and database-enforces active code and name uniqueness",()=>{
    expect(sql).toContain("CREATE UNIQUE INDEX uq_work_descriptions_code_active");
    expect(sql).toContain("CREATE UNIQUE INDEX uq_work_descriptions_name_active");
    expect(sql).toContain("lower(regexp_replace(btrim(code),'[[:space:]]+',' ','g'))");
    expect(sql).toContain("lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))");
  });
  it("uses canonical lifecycle, idempotency, audit, and conflicts",()=>{
    for(const marker of ["begin_operational_command","finish_operational_command","CREATE_WORK_DESCRIPTION","WORK_DESCRIPTION_CREATED","WORK_DESCRIPTION_CODE_CONFLICT","WORK_DESCRIPTION_NAME_CONFLICT","WORK_DESCRIPTION_ID_CONFLICT","IDEMPOTENCY_MISMATCH"]) expect(sql).toContain(marker);
    expect(sql).toContain("requires_remarks_value,true,sort_order_value,NULL,1");
  });
  it("hardens execution while preserving authenticated reads",()=>{
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog");
    expect(sql).toContain("OWNER TO postgres");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_create_work_description(jsonb) TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.work_descriptions FROM PUBLIC,anon,authenticated");
    expect(sql).not.toMatch(/REVOKE\s+SELECT\s+ON erp\.work_descriptions/i);
  });
});
