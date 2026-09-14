import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDependencyContext } from "@/app/composition/dependencyContext";
import { createApplicationDependencies, PersistenceMode, type ApplicationDependencies } from "@/app/composition";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import RentalLineLifecycleActions from "@/features/rental/workspace/overview/sections/RentalLineLifecycleActions";
import type { RentalRecord } from "@/features/rental/types";
import {
  canUseCanonicalRemoteRentalCloseMutation,
  canUseCanonicalRemoteRentalLineActivateMutation,
  canUseCanonicalRemoteRentalLineCancelMutation,
  canUseCanonicalRemoteRentalLineReleaseMutation,
  canUseCanonicalRemoteRentalLineReserveMutation,
  canUseCanonicalRemoteRentalLineReturnMutation,
} from "@/features/rental/services/rentalRuntimeCapability";
import { SupabaseOperationalCommandRepository } from "@/integrations/supabase/SupabaseOperationalCommandRepository";

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ hasPermission: (permission: string) => auth.permissions.has(permission) }) }));
vi.mock("@/features/rental/remote/canonicalRentalRefresh", () => ({ requestCanonicalRentalRefresh: mocks.refresh }));

const roots: Root[] = [];
const rental = { id: "rental-1", rentalNumber: "R-1", status: "Draft", dateOut: "2026-09-14", rowVersion: 8 } as RentalRecord;
const line = { id: "line-1", rentalId: rental.id, equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", status: "Draft", createdAt: "2026-09-14", updatedAt: "2026-09-14" } as RentalEquipmentLine;
const accepted = (status: string) => ({ success: true, disposition: "ACCEPTED", serverOccurredAt: "2026-09-14T00:00:00Z", refresh: [], value: { rentalId: rental.id, rentalLineId: line.id, status, version: 1 } } as const);
const quickActions = readFileSync("src/features/rental/components/RentalQuickActions.tsx", "utf8");

function lifecycleRepository() {
  return {
    reserveLine: vi.fn(async () => accepted("Reserved")), releaseLine: vi.fn(async () => accepted("Released")),
    activateLine: vi.fn(async () => accepted("Active")), cancelLine: vi.fn(async () => accepted("Cancelled")),
    returnLine: vi.fn(async () => accepted("Returned")),
  };
}

async function renderLifecycle(options: { lineStatus?: RentalEquipmentLine["status"]; parentStatus?: RentalRecord["status"]; permissions?: string[]; enabled?: Partial<ApplicationDependencies["configuration"]>; repository?: ReturnType<typeof lifecycleRepository> } = {}) {
  auth.permissions = new Set(options.permissions ?? ["rental.update", "rental.release", "rental.activate", "rental.return"]);
  const repository = options.repository ?? lifecycleRepository();
  const configuration = {
    persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", remoteOperationalWritesEnabled: false,
    remoteRentalLineReserveEnabled: true, remoteRentalLineReleaseEnabled: true, remoteRentalLineActivateEnabled: true,
    remoteRentalLineCancelEnabled: true, remoteRentalLineReturnEnabled: true, ...options.enabled,
  };
  const dependencies = { configuration, commandRepositories: { rentalLineLifecycleCommands: repository } } as unknown as ApplicationDependencies;
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  await act(async () => root.render(createElement(ApplicationDependencyContext.Provider, { value: dependencies }, createElement(RentalLineLifecycleActions, {
    rental: { ...rental, status: options.parentStatus ?? "Draft" }, line: { ...line, status: options.lineStatus ?? "Draft" }, equipmentLabel: "EQ-1",
  }))));
  return { container, repository };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(async () => { while (roots.length) await act(async () => roots.pop()?.unmount()); });

describe("D5F4B narrow Rental lifecycle wiring", () => {
  it.each([
    ["line Reserve", canUseCanonicalRemoteRentalLineReserveMutation, "remoteRentalLineReserveEnabled"],
    ["line Release", canUseCanonicalRemoteRentalLineReleaseMutation, "remoteRentalLineReleaseEnabled"],
    ["line Activate", canUseCanonicalRemoteRentalLineActivateMutation, "remoteRentalLineActivateEnabled"],
    ["line Cancel", canUseCanonicalRemoteRentalLineCancelMutation, "remoteRentalLineCancelEnabled"],
    ["line Return", canUseCanonicalRemoteRentalLineReturnMutation, "remoteRentalLineReturnEnabled"],
    ["parent Close", canUseCanonicalRemoteRentalCloseMutation, "remoteRentalCloseEnabled"],
  ] as const)("enables %s only when its narrow flag is true in remote mode", (_label, canUse, flag) => {
    const configuration = { persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", remoteOperationalWritesEnabled: false } as ApplicationDependencies["configuration"];
    expect(canUse(configuration)).toBe(false);
    expect(canUse({ ...configuration, [flag]: true })).toBe(true);
    expect(canUse({ ...configuration, persistenceMode: PersistenceMode.Local, [flag]: true })).toBe(false);
  });

  it("composes each explicitly enabled line command and Close while broad writes are false", async () => {
    const base = { persistenceMode: PersistenceMode.Remote, equipmentStatusSource: "supabase", supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test_value", remoteOperationalWritesEnabled: false } as const;
    const cases = [
      ["remoteRentalLineReserveEnabled", "reserveLine"], ["remoteRentalLineReleaseEnabled", "releaseLine"],
      ["remoteRentalLineActivateEnabled", "activateLine"], ["remoteRentalLineCancelEnabled", "cancelLine"],
      ["remoteRentalLineReturnEnabled", "returnLine"],
    ] as const;
    for (const [flag, method] of cases) {
      const dependencies = createApplicationDependencies({ ...base, [flag]: true });
      expect(dependencies.configuration.remoteOperationalWritesEnabled).toBe(false);
      expect(dependencies.commandRepositories.rentalLineLifecycleCommands?.[method]).toEqual(expect.any(Function));
      expect(dependencies.commandRepositories.canonicalEquipment).toBeUndefined();
      expect(dependencies.commandRepositories.canonicalCustomer).toBeUndefined();
    }
    const close = createApplicationDependencies({ ...base, remoteRentalCloseEnabled: true });
    expect(close.commandRepositories.rentalClosureCommands?.close).toEqual(expect.any(Function));
    const disabled = createApplicationDependencies(base);
    expect(disabled.commandRepositories.rentalLineLifecycleCommands).toBeUndefined();
    await expect(disabled.commandRepositories.rentalClosureCommands.close({ commandId: "command-3", idempotencyKey: "key-3", rentalId: rental.id })).resolves.toMatchObject({ success: false, code: "NOT_ENABLED" });
  });

  it("maps every line command and parent Close to the exact canonical RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: false, code: "FORBIDDEN", message: "Forbidden", retryable: false, refreshRequired: false }, error: null });
    const repository = new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) });
    const identity = { commandId: "command-1", idempotencyKey: "key-1", rentalId: rental.id, rentalLineId: line.id };
    await repository.reserveLine(identity); await repository.releaseLine(identity); await repository.activateLine(identity); await repository.cancelLine(identity);
    await repository.returnLine({ ...identity, equipmentId: line.equipmentId, assignmentId: line.assignmentId, actualReturnDate: "2026-09-14" });
    await repository.close({ commandId: "command-2", idempotencyKey: "key-2", rentalId: rental.id });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["command_reserve_rental_line", "command_release_rental_line", "command_activate_rental_line", "command_cancel_rental_line", "command_return_rental_line", "command_close_rental"]);
    expect(rpc).toHaveBeenCalledWith("command_return_rental_line", { command: { ...identity, equipmentId: line.equipmentId, assignmentId: line.assignmentId, actualReturnDate: "2026-09-14" } });
  });

  it("shows only Reserve and Cancel for a Draft line", async () => {
    const { container } = await renderLifecycle();
    expect(container.textContent).toContain("Reserve Equipment"); expect(container.textContent).toContain("Cancel Equipment");
    expect(container.textContent).not.toContain("Release Equipment"); expect(container.textContent).not.toContain("Activate Equipment"); expect(container.textContent).not.toContain("Return Equipment");
  });

  it("shows only Release and Cancel for a Reserved line", async () => {
    const { container } = await renderLifecycle({ lineStatus: "Reserved" });
    expect(container.textContent).toContain("Release Equipment"); expect(container.textContent).toContain("Cancel Equipment"); expect(container.textContent).not.toContain("Reserve Equipment");
  });

  it("shows only Activate and Cancel for a Released line", async () => {
    const { container } = await renderLifecycle({ lineStatus: "Released" });
    expect(container.textContent).toContain("Activate Equipment"); expect(container.textContent).toContain("Cancel Equipment"); expect(container.textContent).not.toContain("Return Equipment");
  });

  it("shows only Return Equipment for an Active line", async () => {
    const { container } = await renderLifecycle({ lineStatus: "Active", parentStatus: "Active" });
    expect(container.textContent).toContain("Return Equipment"); expect(container.textContent).not.toContain("Cancel Equipment");
  });

  it.each(["Returned", "Cancelled"] as const)("keeps a %s line mutation-free", async (lineStatus) => {
    const { container } = await renderLifecycle({ lineStatus, parentStatus: "Active" });
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it.each(["Cancelled", "Closed", "Returned"] as const)("keeps a %s parent read-only", async (parentStatus) => {
    const { container } = await renderLifecycle({ parentStatus, lineStatus: "Draft" });
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toContain("read-only");
  });

  it("hides a line action without its exact RBAC capability", async () => {
    const { container } = await renderLifecycle({ lineStatus: "Released", permissions: ["rental.update"] });
    expect(container.textContent).toContain("Cancel Equipment"); expect(container.textContent).not.toContain("Activate Equipment");
  });

  it("dispatches Return Equipment only to the selected line and preserves Return All wording", async () => {
    const repository = lifecycleRepository(); const { container } = await renderLifecycle({ lineStatus: "Active", parentStatus: "Active", repository });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Return date for EQ-1"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-09-14"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Return Equipment")!.click(); });
    expect(repository.returnLine).toHaveBeenCalledWith(expect.objectContaining({ rentalId: rental.id, rentalLineId: line.id, equipmentId: line.equipmentId, assignmentId: line.assignmentId, actualReturnDate: "2026-09-14" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not expose Reserve when its narrow flag is disabled", async () => {
    const { container } = await renderLifecycle({ enabled: { remoteRentalLineReserveEnabled: false } });
    expect(container.textContent).not.toContain("Reserve Equipment");
    expect(container.textContent).toContain("Cancel Equipment");
  });

  it("dispatches Reserve only to the selected line", async () => {
    const repository = lifecycleRepository(); const { container } = await renderLifecycle({ repository });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Reserve Equipment")!.click(); });
    expect(repository.reserveLine).toHaveBeenCalledWith(expect.objectContaining({ rentalId: rental.id, rentalLineId: line.id }));
    expect(repository.reserveLine).not.toHaveBeenCalledWith(expect.objectContaining({ rentalLineId: "line-2" }));
  });

  it("does not invoke a whole-Rental return repository from Return Equipment", async () => {
    const repository = { ...lifecycleRepository(), returnAll: vi.fn() };
    const { container } = await renderLifecycle({ lineStatus: "Active", parentStatus: "Active", repository });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Return date for EQ-1"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-09-14"); input.dispatchEvent(new Event("input", { bubbles: true })); [...container.querySelectorAll("button")].find((button) => button.textContent === "Return Equipment")!.click(); });
    expect(repository.returnLine).toHaveBeenCalledTimes(1);
    expect(repository.returnAll).not.toHaveBeenCalled();
  });

  it("preserves a distinct Return All Equipment label for the whole-Rental workflow", () => {
    expect(quickActions).toContain('label: "Return All Equipment"');
  });

  it("preserves the canonical closure prerequisite error without collapsing it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: false, code: "INVALID_TRANSITION", message: "Rental is not ready to close.", retryable: false, refreshRequired: false }, error: null });
    const result = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) }).close({ commandId: "command-4", idempotencyKey: "key-4", rentalId: rental.id });
    expect(result).toMatchObject({ success: false, code: "INVALID_TRANSITION", message: "Rental is not ready to close." });
  });

  it("preserves a line lifecycle rejection even when the server omits optional display fields", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: false, code: "PARENT_READ_ONLY" }, error: null });
    const result = await new SupabaseOperationalCommandRepository({ schema: () => ({ rpc }) }).cancelLine({ commandId: "command-5", idempotencyKey: "key-5", rentalId: rental.id, rentalLineId: line.id });
    expect(result).toMatchObject({ success: false, code: "PARENT_READ_ONLY", message: "The remote command was rejected." });
  });
});
