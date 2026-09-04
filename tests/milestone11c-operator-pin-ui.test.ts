import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { validateOperatorPin } from "@/features/auth/services/operatorPinPolicy";
import { SupabaseRemoteUserAdministration } from "@/integrations/supabase/SupabaseRemoteUserAdministration";

const page = readFileSync("src/features/users/pages/UsersPage.tsx", "utf8");
const remote = readFileSync("src/integrations/supabase/SupabaseRemoteUserAdministration.ts", "utf8");

describe("Milestone 11.1C canonical Operator PIN administration UI", () => {
  it.each(["482917", "120983", "908172"])("accepts a valid six-digit PIN: %s", pin => expect(validateOperatorPin(pin)).toBeUndefined());
  it.each(["48291", "4829170", "482a17", "000000", "111111", "123456", "654321"])("rejects an invalid or weak PIN: %s", pin => expect(validateOperatorPin(pin)).toBeDefined());

  it("uses canonical linkage for Reset PIN while retaining Reset Password for non-Operators", () => {
    expect(page).toContain('{user.operatorId?"Reset PIN":"Reset Password"}');
    expect(page).toContain('operatorPinReset=!!resetUser?.operatorId');
    expect(page).toContain('(!remote||canResetPassword)');
  });

  it("renders human-readable credential modes and a masked, numeric six-digit canonical PIN dialog", () => {
    expect(page).toContain('user.credentialMode==="OPERATOR_PIN"?"Operator PIN":"Password"');
    expect(page).toContain('title={operatorPinReset?"Reset Operator PIN":"Reset Password"}');
    expect(page).toContain('inputMode={operatorPinReset?"numeric":undefined}');
    expect(page).toContain('maxLength={canonicalOperatorPinReset?6');
    expect(page).toContain('aria-label={resetVisible?"Hide credential":"Show credential"}');
    expect(page).toContain('finally{setNewPassword("");setConfirmNewPassword("");setResetVisible(false)}');
  });

  it("sends only the established Operator PIN request shape to its dedicated endpoint", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: "caller-jwt" } } }) } };
    const administration = new SupabaseRemoteUserAdministration(client as never);
    await administration.resetOperatorPin("operator-user", "482917", "482917", "command", "idempotency");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/admin/users/operator-user/reset-operator-pin");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ newPin: "482917", confirmNewPin: "482917", commandId: "command", idempotencyKey: "idempotency" });
    expect(remote).toContain("credential_mode");
    fetcher.mockRestore();
  });

  it("retains the existing password-reset endpoint for non-Operators", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: "caller-jwt" } } }) } };
    const administration = new SupabaseRemoteUserAdministration(client as never);
    await administration.resetPassword("office-user", "NewPassword8!", "command", "idempotency");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/admin/users/office-user/reset-password");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ newPassword: "NewPassword8!", commandId: "command", idempotencyKey: "idempotency" });
    fetcher.mockRestore();
  });
});
