import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260823000500_canonical_customer_create.sql","utf8");

describe("canonical Customer create migration",()=>{
  it("authorizes only System Administrator",()=>{
    expect(sql).toContain("'customer.create'");
    expect(sql).toContain("r.code='system-administrator'");
    expect(sql).toMatch(/DELETE FROM erp\.role_permissions[\s\S]*r\.code<>'system-administrator'/);
  });
  it("uses a strict business-record-only command",()=>{
    expect(sql).toContain("key NOT IN('commandId','idempotencyKey','customerId','customerCode','name','email','phone','address')");
    const allowList=sql.match(/key NOT IN\(([^)]+)\)/)?.[1] ?? "";
    for(const field of ["companyId","actorId","userId","password","pin","roleId","contactPerson"]) expect(allowList).not.toContain(`'${field}'`);
    expect(sql).toContain("customer_id_value !~*");
  });
  it("uses canonical lifecycle, idempotency, audit, and conflicts",()=>{
    for(const marker of ["begin_operational_command","finish_operational_command","CREATE_CUSTOMER","CUSTOMER_CREATED","CUSTOMER_CODE_CONFLICT","CUSTOMER_ID_CONFLICT","IDEMPOTENCY_MISMATCH"]) expect(sql).toContain(marker);
    expect(sql).toContain("true,NULL,actor,actor,tenant,1");
  });
  it("hardens execution and direct DML",()=>{
    expect(sql).toContain("SECURITY DEFINER SET search_path=erp,auth,extensions,pg_catalog");
    expect(sql).toContain("OWNER TO postgres");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION erp.command_create_customer(jsonb) TO authenticated");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.customers FROM PUBLIC,anon,authenticated");
  });
});
