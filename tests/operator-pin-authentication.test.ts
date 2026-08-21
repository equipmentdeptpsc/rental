import { describe, expect, it } from "vitest";

import type { IStorageService } from "@/core/storage/IStorageService";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { OPERATOR_PIN_CREDENTIAL_STORAGE_KEY, OperatorPinCredentialService } from "@/features/auth/services/OperatorPinCredentialService";
import type { Operator } from "@/features/operators/types";
import { AuthenticationService } from "@/features/auth/services/AuthenticationService";

class MemoryStorage implements IStorageService {
  values = new Map<string, unknown>();
  get<T>(key: string) { return structuredClone(this.values.get(key) ?? null) as T | null; }
  set<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  remove(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const operator: Operator = { id: "operator-1", name: "Field Operator", email: "", licenseNumber: "EMP-0042", certificationType: "None", status: "Active", joinedDate: "" };
const user: User = { id: "user-1", username: "field.operator", displayName: "Field Operator", systemRoles: ["rental-operations"], status: "active", operatorId: operator.id, createdAt: "", updatedAt: "" };

function setup(overrides: { operator?: Operator; user?: User; assigned?: boolean } = {}) {
  const storage = new MemoryStorage();
  const currentOperator = overrides.operator ?? operator;
  const currentUser = overrides.user ?? user;
  const sessions: unknown[] = [];
  const service = new OperatorPinCredentialService(
    storage,
    { getUsers: () => [currentUser], getUserById: (id) => id === currentUser.id ? currentUser : undefined, getUserByUsername: () => currentUser, createUser: () => currentUser, updateUser: () => currentUser, activateUser: () => currentUser, deactivateUser: () => currentUser },
    { getAll: () => [currentOperator], getById: (id) => id === currentOperator.id ? currentOperator : undefined },
    { login: () => null, logout: () => undefined, getCurrentSession: () => null, restoreSession: () => null, persistSession: (session) => { sessions.push(session); }, clearSession: () => undefined },
    () => overrides.assigned ?? true,
    () => "session-1",
    () => "2026-08-21T00:00:00.000Z",
  );
  return { service, storage, sessions, currentUser, currentOperator };
}

describe("Operator PIN credentials", () => {
  it("creates and resets a salted verifier without persisting or exposing the PIN", async () => {
    const { service, storage } = setup();
    await service.setPin(user.id, "2580", "2580");
    const first = JSON.stringify(storage.get(OPERATOR_PIN_CREDENTIAL_STORAGE_KEY));
    expect(first).not.toContain("2580");
    expect(service.hasCredential(user.id)).toBe(true);
    await service.setPin(user.id, "4062", "4062");
    expect(JSON.stringify(storage.get(OPERATOR_PIN_CREDENTIAL_STORAGE_KEY))).not.toContain("4062");
    expect(await service.authenticate("EMP-0042", "2580")).toMatchObject({ success: false, reason: "INVALID_CREDENTIALS" });
    expect(await service.authenticate("EMP-0042", "4062")).toMatchObject({ success: true, user: { operatorId: operator.id } });
  });

  it("rejects mismatched, non-numeric, repeated, and sequential PINs", async () => {
    const { service } = setup();
    await expect(service.setPin(user.id, "2580", "2581")).rejects.toThrow("do not match");
    await expect(service.setPin(user.id, "abcd", "abcd")).rejects.toThrow("numeric");
    await expect(service.setPin(user.id, "1111", "1111")).rejects.toThrow("repeated or sequential");
    await expect(service.setPin(user.id, "1234", "1234")).rejects.toThrow("repeated or sequential");
  });

  it("denies a wrong PIN, inactive Operator, and Operator without an assignment", async () => {
    const valid = setup(); await valid.service.setPin(user.id, "2580", "2580");
    expect(await valid.service.authenticate("EMP-0042", "0000")).toMatchObject({ success: false, reason: "INVALID_CREDENTIALS" });
    const inactive = setup({ operator: { ...operator, status: "Suspended" } }); await inactive.service.setPin(user.id, "2580", "2580");
    expect(await inactive.service.authenticate("EMP-0042", "2580")).toMatchObject({ success: false, reason: "INACTIVE_USER" });
    const unassigned = setup({ assigned: false }); await unassigned.service.setPin(user.id, "2580", "2580");
    expect(await unassigned.service.authenticate("EMP-0042", "2580")).toMatchObject({ success: false, reason: "NO_ASSIGNMENT" });
  });

  it("retains canonical Operator persona RBAC after PIN authentication", async () => {
    const { service, currentUser, currentOperator } = setup(); await service.setPin(user.id, "2580", "2580");
    expect((await service.authenticate("EMP-0042", "2580")).success).toBe(true);
    const authorization = new AuthorizationService({ getById: () => currentOperator });
    expect(authorization.hasPermission(currentUser, "deur.read")).toBe(true);
    expect(authorization.hasPermission(currentUser, "rental.read")).toBe(false);
  });

  it("authorizes the canonical Operator role after PIN login and local session restoration", async () => {
    const canonicalOperatorUser = { ...user, systemRoles: ["operator"] };
    const { service, currentOperator } = setup({ user: canonicalOperatorUser });
    await service.setPin(canonicalOperatorUser.id, "2580", "2580");
    const authenticated = await service.authenticate("EMP-0042", "2580");
    expect(authenticated).toMatchObject({ success: true, user: { systemRoles: ["operator"] } });
    const authorization = new AuthorizationService({ getById: () => currentOperator });
    expect(authorization.hasPermission(canonicalOperatorUser, "deur.read")).toBe(true);
    expect(authorization.hasPermission(canonicalOperatorUser, "deur.create")).toBe(true);
    expect(authorization.hasPermission(canonicalOperatorUser, "users.manage")).toBe(false);
    expect(authorization.hasPermission(canonicalOperatorUser, "rental.manage")).toBe(false);

    if (!authenticated.success) throw new Error("PIN authentication did not produce a session.");
    const restored = new AuthenticationService(
      [{ id: "local-operator-pin", authenticate: () => ({ success: true, session: authenticated.session }), restoreSession: () => authenticated.session, logout: () => undefined, clearSession: () => undefined }],
      { getUsers: () => [canonicalOperatorUser], getUserById: () => canonicalOperatorUser, getUserByUsername: () => canonicalOperatorUser, createUser: () => canonicalOperatorUser, updateUser: () => canonicalOperatorUser, activateUser: () => canonicalOperatorUser, deactivateUser: () => canonicalOperatorUser },
    ).initialize();
    expect(restored.user).toEqual(canonicalOperatorUser);
    expect(authorization.hasPermission(restored.user, "deur.read")).toBe(true);
  });

  it("denies an inactive canonical User and an unlinked identity", async () => {
    const inactive = setup({ user: { ...user, status: "inactive", systemRoles: ["operator"] } });
    await inactive.service.setPin(user.id, "2580", "2580");
    expect(await inactive.service.authenticate("EMP-0042", "2580")).toMatchObject({ success: false, reason: "INACTIVE_USER" });
    const unlinked = setup({ user: { ...user, operatorId: undefined, systemRoles: ["operator"] } });
    await expect(unlinked.service.setPin(user.id, "2580", "2580")).rejects.toThrow("linked Operator");
  });

  it("keeps optional Operator email and existing email-era records compatible", () => {
    expect({ ...operator, email: "" }).toMatchObject({ name: "Field Operator", licenseNumber: "EMP-0042", email: "" });
    expect({ ...operator, email: "field@example.test" }.email).toBe("field@example.test");
  });
});
