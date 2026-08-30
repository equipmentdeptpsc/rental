import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("worker/uatMultiOperatorLinkageInspection.ts", "utf8");
const index = readFileSync("worker/index.ts", "utf8");
const cors = readFileSync("worker/uatAdminCors.ts", "utf8");
const wrangler = readFileSync("wrangler.jsonc", "utf8");

describe("isolated UAT multi-operator linkage inspection", () => {
  it("is exposed only through the authenticated scenario-scoped route", () => {
    expect(index).toContain("/api/admin/uat/inspect-multi-operator-linkage");
    expect(source).toContain('authorization');
    expect(source).toContain('system-administrator');
    expect(source).toContain('settings.update');
    expect(source).toContain('get_isolated_uat_tenant_metadata');
    expect(source).toContain('VALIDATION_REJECTED');
  });

  it("allows only the configured UAT web origins and required headers", () => {
    expect(index).toContain('request.method==="OPTIONS"');
    expect(index).toContain('uatAdminCorsHeaders(request,environment)');
    expect(wrangler).toContain('http://localhost:8081,https://uat.pscequipment.online');
    expect(cors).toContain('allowed.includes(origin)');
    expect(cors).toContain('access-control-allow-methods');
    expect(cors).toContain('authorization, content-type');
    expect(cors).toContain('vary');
    expect(cors).not.toContain('"*"');
  });

  it("uses exact certified operators and lines and never returns credentials", () => {
    for (const value of [
      "e6bf4e8b-8e3a-4c65-a05e-ee4ed281e876",
      "cac542f6-2d18-4275-8c26-0728d858c912",
      "584df24a-c104-4001-b175-c141903f12d5",
      "22dd0a6f-6f74-4ca4-a48e-2ec5e6d1cbf2",
      "d1df121a-94f2-47e3-a153-3e47e1218878",
      "aeafa42d-97dd-40a5-bca7-8ed36e495153",
    ]) expect(source).toContain(value);
    expect(source).toContain("LOGIN_READY");
    expect(source).toContain("MULTIPLE_LINKED_USERS");
    expect(source).toContain("crossOperatorExposure");
    expect(source).not.toContain("password_hash");
    expect(source).not.toContain("access_token");
    expect(source).not.toContain("refresh_token");
    expect(source).toContain("mutationPerformed: false");
  });

  it("projects safe diagnostics for upstream 503 boundaries", () => {
    expect(source).toContain('phase: "SCENARIO_INSPECTION"');
    expect(source).toContain('safeResultCode: safeErrorClass');
    expect(source).toContain('phase: "OPERATOR_LINKAGE_READ"');
    expect(source).not.toContain('error.message');
    expect(source).toContain('inspectionImplementationVersion: "multi-operator-linkage-users-no-email-v1"');
  });
});
