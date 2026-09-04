import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { TrustedUsernameAuthentication, type UsernameLoginLimiters } from "../worker/usernameAuthentication";

const migration = readFileSync("supabase/migrations/20260904000100_username_login_credential_mode_policy.sql", "utf8");
const worker = readFileSync("worker/usernameAuthentication.ts", "utf8");
const session = { access_token: "access-token", refresh_token: "refresh-token" };
const limits = (): UsernameLoginLimiters => {
  const allow = () => ({ limit: vi.fn(async () => ({ success: true })) });
  return { networkBurst: allow(), networkSustained: allow(), identifierBurst: allow(), identifierSustained: allow() };
};
const request = () => new Request("https://uat.example/api/auth/username-login", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.20" }, body: JSON.stringify({ identifier: "uat.pilot.operator.003", password: "test-only-placeholder" }) });

describe("Milestone 11.1E generic username-login credential policy", () => {
  it("rejects PIN-mode identities before password verification with normalized failure", async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { session }, error: null }));
    const result = await new TrustedUsernameAuthentication({ schema: () => ({ rpc: async () => ({ data: { success: true, email: "hidden@example.test", credentialMode: "OPERATOR_PIN" }, error: null }) }) }, { auth: { signInWithPassword } }, limits()).handle(request());
    expect(result).toEqual({ status: 401, body: { success: false, message: "Invalid username/email or password." } });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("hidden@example.test");
  });

  it("preserves generic password login for PASSWORD-mode and non-Operator identities", async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { session }, error: null }));
    const result = await new TrustedUsernameAuthentication({ schema: () => ({ rpc: async () => ({ data: { success: true, email: "hidden@example.test", credentialMode: "PASSWORD" }, error: null }) }) }, { auth: { signInWithPassword } }, limits()).handle(request());
    expect(result.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledOnce();
  });

  it("keeps the resolver service-role-only and returns only internal credential mode metadata", () => {
    expect(migration).toContain("min(application_user.credential_mode)");
    expect(migration).toContain("'credentialMode'");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(worker).toContain("resolved.credentialMode==='OPERATOR_PIN'");
    expect(worker).not.toContain("This account uses PIN");
  });
});
