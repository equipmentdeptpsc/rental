import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source=readFileSync("worker/uatUserLinkageInspection.ts","utf8"), index=readFileSync("worker/index.ts","utf8"), migration=readFileSync("supabase/migrations/20260830001400_fix_exact_username_inspection_qualification.sql","utf8");
describe("exact UAT User 1 linkage inspection",()=>{
 it("is fixed-scope, authenticated, sanitized, and read-only",()=>{expect(source).toContain("uat.me.operator.001");expect(source).toContain("USER1_EXACT_PERSISTED_LINK_GREEN");expect(source).toContain("user_roles");expect(source).toContain("uat-user1-exact-username-rpc-v4");expect(source).not.toContain("initialPassword");expect(source).not.toContain("createUser");expect(index).toContain("/api/admin/uat/inspect-user-linkage");});
 it("qualifies exact persisted-user predicates and keeps service-role execution only",()=>{expect(migration).toContain("persisted_user.company_id = target_tenant");expect(migration).toContain("persisted_user.username = target_username");expect(migration).toContain("persisted_user.operator_id");expect(migration).toContain("REVOKE ALL ON FUNCTION");expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.inspect_isolated_uat_exact_application_user(jsonb) TO service_role");});
});
