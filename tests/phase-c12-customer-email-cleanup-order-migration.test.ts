import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const path="supabase/migrations/20260803004800_phase_c12_customer_email_cleanup_dependency_order_correction.sql";
const sql=readFileSync(path,"utf8");
const previous=readFileSync("supabase/migrations/20260803004700_phase_c12_customer_email_certification_cleanup.sql","utf8");
const position=(value:string)=>{const found=sql.indexOf(value);expect(found).toBeGreaterThan(-1);return found;};
describe("C12 customer-email cleanup dependency-order correction",()=>{
 it("preserves applied 04700 byte-for-byte",()=>expect(createHash("sha256").update(previous).digest("hex")).toBe("01fb34731efbd02b4a345c04fe1c2ffc0083c42de7ea1402af12fe75f19a7487"));
 it("replaces only the exact cleanup function contract",()=>{expect(sql).toContain("CREATE OR REPLACE FUNCTION erp.cleanup_c12_customer_email_certification_fixture");expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION erp\.(?!cleanup_c12_customer_email_certification_fixture)/);});
 it("uses live-FK-safe child-to-parent order including ERP user before operator",()=>{
   expect(position("DELETE FROM notification_delivery_attempts")).toBeLessThan(position("DELETE FROM notification_outbox"));
   expect(position("DELETE FROM deur_events")).toBeLessThan(position("DELETE FROM deurs"));
   expect(position("DELETE FROM commercial_snapshots")).toBeLessThan(position("DELETE FROM rental_contracts"));
   expect(position("DELETE FROM rental_contracts")).toBeLessThan(position("DELETE FROM rental_equipment_lines"));
   expect(position("DELETE FROM rental_equipment_lines")).toBeLessThan(position("DELETE FROM rentals"));
   expect(position("DELETE FROM rentals")).toBeLessThan(position("DELETE FROM assignments"));
   expect(position("DELETE FROM assignments")).toBeLessThan(position("DELETE FROM equipment"));
   expect(position("DELETE FROM user_roles")).toBeLessThan(position("DELETE FROM users WHERE"));
   expect(position("DELETE FROM users WHERE")).toBeLessThan(position("DELETE FROM operators"));
   expect(position("DELETE FROM operators")).toBeLessThan(position("DELETE FROM projects"));
   expect(position("DELETE FROM projects")).toBeLessThan(position("DELETE FROM customers"));
   expect(position("DELETE FROM customers")).toBeLessThan(position("DELETE FROM companies"));
 });
 it("preserves exact scope and security invariants",()=>{for(const value of ["TENANT-UAT-C12-CUSTOMER-EMAIL-001","CONFIRM-C12-CUSTOMER-EMAIL-CLEANUP","TENANT-LOCAL-001","database-owner session required","SECURITY DEFINER","SET search_path=erp,pg_catalog","FROM PUBLIC,anon,authenticated,service_role","unexpected billing or manager evidence exists","unexpected extra fixture data exists"])expect(sql).toContain(value);});
 it("never mutates Auth or disables enforcement",()=>{expect(sql).not.toMatch(/(?:DELETE|UPDATE|INSERT)\s+(?:FROM\s+|INTO\s+)?auth\.users/i);expect(sql).not.toContain("session_replication_role");expect(sql).not.toMatch(/DISABLE\s+TRIGGER/i);expect(sql).not.toMatch(/LIKE\s+'TENANT-UAT|SIMILAR TO|~\s*'TENANT-UAT/i);});
 it("retains narrow populated-fixture and zero-state guards",()=>{expect(sql).toContain("count(*) FROM users WHERE company_id=target_tenant_id)>2");expect(sql).toContain("count(*) FROM deurs WHERE company_id=target_tenant_id)>2");expect(sql).toContain("RETURN removed");});
});
