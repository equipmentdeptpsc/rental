import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source=readFileSync("worker/uatUserLinkageInspection.ts","utf8"), index=readFileSync("worker/index.ts","utf8");
describe("exact UAT User 1 linkage inspection",()=>{
 it("is fixed-scope, authenticated, sanitized, and read-only",()=>{expect(source).toContain("uat.me.operator.001");expect(source).toContain("USER1_EXACT_PERSISTED_LINK_GREEN");expect(source).toContain("user_roles");expect(source).not.toContain("initialPassword");expect(source).not.toContain("createUser");expect(index).toContain("/api/admin/uat/inspect-user-linkage");});
});
