import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { AuthProvider } from "@/features/auth/AuthContext";
import ManagerApproverSettings from "@/features/settings/manager-approver/ManagerApproverSettings";
import { managerApproverRepository, MANAGER_APPROVER_CONFIGURATION_KEY } from "@/features/settings/manager-approver/managerApproverRepository";
import { resolveActiveManagerApprover, saveManagerApproverConfiguration } from "@/features/settings/manager-approver/managerApproverService";
import { developmentApprovalEmailOutbox } from "@/features/rental/approval-email/developmentApprovalEmailOutbox";
import type { ManagerApprovalEmailSnapshot } from "@/features/rental/approval-email/types";

const snapshot: ManagerApprovalEmailSnapshot = { rentalNumber: "R-1", customer: "Customer", project: "Project", rentalType: "Operated Rental", rentalPeriod: "2026-07-22 to 2026-07-23", requestedBy: "Admin", requestedDate: "2026-07-22T00:00:00Z", currentStatus: "Reserved", approvalStatus: "Pending", equipment: [], commercial: [], readiness: { assignmentComplete: true, commercialTermsComplete: true, equipmentAvailable: true, operatorAssigned: true, conflictsDetected: false, expectedReleaseDate: "2026-07-22" }, warnings: [] };

describe("Manager approver configuration", () => {
  beforeEach(() => storage.clear());

  it("saves and resolves exactly one valid active Manager approver", () => {
    expect(saveManagerApproverConfiguration({ name: "  UAT Manager ", email: "UAT.Manager@Example.Test ", active: true }, "2026-07-22T00:00:00Z")).toMatchObject({ success: true, configuration: { name: "UAT Manager", email: "uat.manager@example.test", active: true } });
    expect(resolveActiveManagerApprover()).toMatchObject({ success: true, configuration: { name: "UAT Manager", email: "uat.manager@example.test" } });
    expect(managerApproverRepository.getAll()).toHaveLength(1);
  });

  it("rejects missing, inactive, invalid, and multiple active configurations", () => {
    expect(resolveActiveManagerApprover()).toMatchObject({ success: false, code: "MANAGER_APPROVER_NOT_CONFIGURED" });
    expect(saveManagerApproverConfiguration({ name: "Manager", email: "not-an-email", active: true })).toMatchObject({ success: false, code: "MANAGER_APPROVER_EMAIL_INVALID" });
    expect(saveManagerApproverConfiguration({ name: "", email: "manager@example.test", active: true })).toMatchObject({ success: false, code: "MANAGER_APPROVER_NAME_REQUIRED" });
    expect(saveManagerApproverConfiguration({ name: "Manager", email: "manager@example.test", active: false })).toMatchObject({ success: true, configuration: { active: false } });
    expect(resolveActiveManagerApprover()).toMatchObject({ success: false, code: "MANAGER_APPROVER_NOT_CONFIGURED" });
    storage.set(MANAGER_APPROVER_CONFIGURATION_KEY, [
      { id: "one", name: "One", email: "one@example.test", active: true },
      { id: "two", name: "Two", email: "two@example.test", active: true },
    ]);
    expect(resolveActiveManagerApprover()).toMatchObject({ success: false, code: "MANAGER_APPROVER_MULTIPLE_ACTIVE" });
  });

  it("captures an immutable recipient snapshot when later Settings change", () => {
    saveManagerApproverConfiguration({ name: "First Manager", email: "first@example.test", active: true }, "2026-07-22T00:00:00Z");
    const approver = resolveActiveManagerApprover();
    if (!approver.success) throw new Error(approver.message);
    const email = developmentApprovalEmailOutbox.create({ rentalId: "rental-1", recipientName: approver.configuration.name, recipient: approver.configuration.email, generatedAt: "2026-07-22T01:00:00Z", snapshot });
    saveManagerApproverConfiguration({ name: "Second Manager", email: "second@example.test", active: true }, "2026-07-22T02:00:00Z");
    expect(developmentApprovalEmailOutbox.getById(email.id)).toMatchObject({ recipientName: "First Manager", recipient: "first@example.test", generatedAt: "2026-07-22T01:00:00Z" });
  });

  it("exposes editable Settings only to the current Admin role", async () => {
    storage.set("auth_user", { id: "operator", name: "Operator", role: "Operator" });
    storage.set("auth_token", "local-token");
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(AuthProvider, null, createElement(ManagerApproverSettings))));
    expect(container.textContent).toContain("Only an Admin may change this configuration.");
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => root.unmount());

    storage.set("auth_user", { id: "admin", name: "Admin", role: "Admin" });
    const adminContainer = document.createElement("div");
    const adminRoot = createRoot(adminContainer);
    await act(async () => adminRoot.render(createElement(AuthProvider, null, createElement(ManagerApproverSettings))));
    expect(adminContainer.querySelector("button")?.disabled).toBe(false);
    await act(async () => adminRoot.unmount());
  });
});
