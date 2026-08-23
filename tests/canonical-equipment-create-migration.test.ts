import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/20260823000300_canonical_equipment_create.sql","utf8");

describe("canonical Equipment create migration",()=>{
 it("scopes equipment.create to System Administrator",()=>{expect(sql).toContain("'equipment.create'");expect(sql).toContain("r.code='system-administrator'");expect(sql).toMatch(/DELETE FROM erp\.role_permissions[\s\S]*r\.code<>'system-administrator'/);});
 it("defines an Equipment-owned Cost Code projection",()=>{for(const value of["read_canonical_equipment_reference_data","'costCodes'","c.active AND c.deleted_at IS NULL"])expect(sql).toContain(value);expect(sql).not.toContain("read_canonical_rental_reference_data");expect(sql).not.toMatch(/GRANT SELECT[\s\S]*cost_codes/i);});
 it("forces lifecycle and rejects unsupported input",()=>{for(const value of["command_create_equipment","upper(btrim(s.code))='AVAILABLE'","project_id,operator_id","true,NULL,NULL","jsonb_object_keys(command)","Engine Hours","Kilometers","Mileage","Calendar Days"])expect(sql).toContain(value);});
 it("uses canonical command, audit, and safe conflict boundaries",()=>{for(const value of["begin_operational_command","finish_operational_command","EQUIPMENT_CREATED","ASSET_NUMBER_CONFLICT","EQUIPMENT_ID_CONFLICT","IDEMPOTENCY_MISMATCH"])expect(sql).toContain(value);});
 it("keeps RPCs authenticated-only and table DML denied",()=>{expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");expect(sql).toContain("TO authenticated");expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE ON erp.equipment FROM PUBLIC,anon,authenticated");expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)[\s\S]*erp\.equipment/i);});
});
