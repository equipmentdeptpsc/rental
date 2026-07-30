import { describe, expect, it } from "vitest";
import {
  assertSafeSupabaseTestConfiguration,
  assertSupabaseFixtureMutationAllowed,
  type SupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { assertSafePhaseC4bFixtureSql } from "./support/phaseC4bPrivilegedSql";

const isolated: SupabasePhaseC2TestConfiguration = {
  enabled: true,
  url: "https://opaqueuatref.supabase.co",
  publishableKey: "publishable-test-key",
  serviceKey: "service-test-key",
  environmentId: "isolated-uat",
  projectRef: "opaqueuatref",
  allowMutation: true,
};

describe("Phase C4B isolated-project safety guard", () => {
  it("accepts an opaque Supabase ref only when the URL ref matches and the environment is test-like", () => {
    expect(() => assertSafeSupabaseTestConfiguration(isolated)).not.toThrow();
  });

  it("rejects a mismatched project ref and a production-classified environment", () => {
    expect(() => assertSafeSupabaseTestConfiguration({ ...isolated, projectRef: "differentref" })).toThrow(
      "URL and project ref match",
    );
    expect(() => assertSafeSupabaseTestConfiguration({ ...isolated, environmentId: "production" })).toThrow(
      "URL and project ref match",
    );
  });

  it("restricts destructive fixture identities to TENANT-UAT prefixes", () => {
    expect(() => assertSupabaseFixtureMutationAllowed(isolated, ["TENANT-UAT-C4B-AUTH"])).not.toThrow();
    expect(() => assertSupabaseFixtureMutationAllowed(isolated, ["TENANT-LOCAL-001"])).toThrow(
      "TENANT-UAT",
    );
  });

  it("allows only allowlisted C4B fixture SQL and rejects privilege or baseline changes", () => {
    expect(() =>
      assertSafePhaseC4bFixtureSql({
        tenantIds: ["TENANT-UAT-C4B-AUTH"],
        sql: "INSERT INTO erp.companies(id) VALUES('TENANT-UAT-C4B-AUTH');",
      }),
    ).not.toThrow();
    expect(() =>
      assertSafePhaseC4bFixtureSql({
        tenantIds: ["TENANT-UAT-C4B-AUTH"],
        sql: "GRANT USAGE ON SCHEMA erp TO service_role;",
      }),
    ).toThrow("forbidden");
    expect(() =>
      assertSafePhaseC4bFixtureSql({
        tenantIds: ["TENANT-UAT-C4B-AUTH"],
        sql: "DELETE FROM erp.companies WHERE id='TENANT-LOCAL-001';",
      }),
    ).toThrow("forbidden");
    expect(() =>
      assertSafePhaseC4bFixtureSql({
        tenantIds: ["TENANT-UAT-C4B-AUTH"],
        sql: "DELETE FROM erp.companies WHERE id='TENANT-UAT-C4B-OTHER';",
      }),
    ).toThrow("outside the explicit allowlist");
  });
});
