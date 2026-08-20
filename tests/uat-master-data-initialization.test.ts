import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import { LocalEquipmentRepository } from "@/features/equipment/repository/LocalEquipmentRepository";
import { initializeRequiredMasterData } from "@/features/masters/initializeRequiredMasterData";
import { equipmentBrandRepository } from "@/features/masters/equipment-brand/repository";
import { equipmentCategoryRepository } from "@/features/masters/equipment-category/repository";
import { equipmentConditionRepository } from "@/features/masters/equipment-condition/repository";
import { equipmentLocationRepository } from "@/features/masters/equipment-location/repository";
import { equipmentOwnershipRepository } from "@/features/masters/equipment-ownership/repository";
import { equipmentStatusRepository } from "@/features/masters/equipment-status/repository";
import { equipmentTypeRepository } from "@/features/masters/equipment-type/repository";
import { rentalStatusRepository } from "@/features/masters/rental-status/repository/RentalStatusRepository";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import { rentalBillingMethods, rentalTypes } from "@/features/rental/types";
import { prefixRepository } from "@/features/settings/repository/prefixRepository";
import { resetApplicationData } from "@/features/settings/services/applicationBackupService";
import { ApplicationDependencyProvider } from "@/app/composition";
import MasterProviders from "@/app/MasterProviders";
import { PrefixProvider } from "@/features/settings/context/PrefixContext";
import { EquipmentProvider } from "@/features/equipment/context/EquipmentContext";
import EquipmentForm from "@/features/equipment/components/EquipmentForm";

describe("clean UAT master-data initialization", () => {
  beforeEach(() => storage.clear());

  it("seeds every required selectable reference without transactional Equipment", () => {
    initializeRequiredMasterData();

    expect(equipmentTypeRepository.getAll()).not.toHaveLength(0);
    expect(equipmentBrandRepository.getAll()).not.toHaveLength(0);
    expect(equipmentCategoryRepository.getAll()).not.toHaveLength(0);
    expect(equipmentOwnershipRepository.getAll()).not.toHaveLength(0);
    expect(equipmentConditionRepository.getAll()).not.toHaveLength(0);
    expect(equipmentLocationRepository.getAll()).not.toHaveLength(0);
    expect(equipmentStatusRepository.getAll().map((item) => item.status)).toContain("Available");
    expect(rentalStatusRepository.getAll().map((item) => item.status)).toEqual(expect.arrayContaining(["Draft", "Reserved", "Released", "Active"]));
    expect(prefixRepository.getAll()).not.toHaveLength(0);
    expect(deurShiftWindowRepository.getAll().map((item) => item.code)).toEqual(["DAY", "NIGHT"]);
    expect(rentalBillingMethods).toContain("Per Hour");
    expect(rentalTypes).toContain("Operated Rental");
    expect(new LocalEquipmentRepository().getAll()).toEqual([]);
  });

  it("is idempotent and preserves customized masters", () => {
    equipmentBrandRepository.create({ id: "custom-brand", brand: "UAT Custom", description: "", active: true, deleted: false });
    initializeRequiredMasterData();
    const first = structuredClone(equipmentBrandRepository.getAll());
    initializeRequiredMasterData();

    expect(equipmentBrandRepository.getAll()).toEqual(first);
    expect(first).toEqual([{ id: "custom-brand", brand: "UAT Custom", description: "", active: true, deleted: false }]);
  });

  it("makes every required Equipment form dropdown selectable", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(ApplicationDependencyProvider, null,
        createElement(PrefixProvider, null,
          createElement(MasterProviders, null,
            createElement(EquipmentProvider, null,
              createElement(EquipmentForm, { onSubmit: vi.fn() }))))));
    });

    const optionLabels = Array.from(container.querySelectorAll("option")).map((option) => option.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining([
      "Generic", "Moving", "Available", "Company Owned", "Serviceable", "Main Yard",
    ]));
    await act(async () => root.unmount());
  });

  it("uses progressive creation fields and preserves state during inline Location creation", async () => {
    initializeRequiredMasterData();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("  PSC   Yard  ");
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(ApplicationDependencyProvider, null,
        createElement(PrefixProvider, null,
          createElement(MasterProviders, null,
            createElement(EquipmentProvider, null,
              createElement(EquipmentForm, { mode: "create", onSubmit: vi.fn() }))))));
    });
    const labels = Array.from(container.querySelectorAll("label")).map((label) => label.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Equipment Category *", "Equipment Sub-category *", "Equipment Code *", "Cost Code", "Asset Number"]));
    expect(labels).not.toEqual(expect.arrayContaining(["Equipment Status", "Equipment Condition"]));
    expect((container.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    const asset = Array.from(container.querySelectorAll("input")).find((input) => input.labels?.[0]?.textContent === "Asset Number")!;
    expect(asset.readOnly).toBe(true);
    const code = Array.from(container.querySelectorAll("input")).find((input) => input.labels?.[0]?.textContent === "Equipment Code *")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(code, "CUSTOM-CODE-7"); code.dispatchEvent(new Event("input", { bubbles: true })); });
    const addLocation = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "+ Add Location")!;
    await act(async () => addLocation.click());
    const location = Array.from(container.querySelectorAll("select")).find((select) => select.labels?.[0]?.textContent === "Initial Location")!;
    expect(location.selectedOptions[0]?.textContent).toBe("PSC Yard");
    expect(code.value).toBe("CUSTOM-CODE-7");
    prompt.mockRestore();
    await act(async () => root.unmount());
  });

  it("full reset clears transactions and immediately recreates stable references", () => {
    storage.set("equipment-records", [{ id: "demo" }]);
    storage.set("assignments", [{ id: "assignment" }]);
    storage.set("equipment-rental-records", [{ id: "rental" }]);
    storage.set("customer_records", [{ id: "customer" }]);
    storage.set("projects", [{ id: "project" }]);
    storage.set("operators", [{ id: "operator" }]);
    storage.set("equipment-rental-deur", [{ id: "deur" }]);
    storage.set("equipment-rental-billing-statements", [{ id: "billing" }]);
    storage.set("equipment-rental-development-approval-email-outbox", [{ id: "email", approvalToken: "secret-token" }]);
    storage.set("equipment-rental-manager-approver-configuration", [{ id: "manager-approver-default", name: "Manager", email: "manager@example.test", active: true }]);
    equipmentBrandRepository.create({ id: "custom-before-reset", brand: "Custom Before Reset", description: "", active: true, deleted: false });

    resetApplicationData();

    for (const key of ["equipment-records", "assignments", "equipment-rental-records", "customer_records", "projects", "operators", "equipment-rental-deur", "equipment-rental-billing-statements"]) {
      expect(storage.get(key)).toBeNull();
    }
    expect(storage.get("equipment-rental-development-approval-email-outbox")).toBeNull();
    expect(storage.get("equipment-rental-manager-approver-configuration")).toEqual([{ id: "manager-approver-default", name: "Manager", email: "manager@example.test", active: true }]);
    expect(equipmentBrandRepository.getAll()).toEqual([expect.objectContaining({ id: "equipment-brand-generic", brand: "Generic" })]);
    const firstTypes = equipmentTypeRepository.getAll();
    initializeRequiredMasterData();
    expect(equipmentTypeRepository.getAll()).toEqual(firstTypes);
    expect(equipmentCategoryRepository.getAll()).not.toHaveLength(0);
    resetApplicationData();
    expect(new Set(equipmentBrandRepository.getAll().map((item) => item.id)).size).toBe(equipmentBrandRepository.getAll().length);
    expect(new Set(equipmentStatusRepository.getAll().map((item) => item.id)).size).toBe(equipmentStatusRepository.getAll().length);
  });

  it("does not repopulate demo Projects or Operators after a reset", async () => {
    resetApplicationData();
    vi.resetModules();
    const [{ projectRepository }, { operatorRepository }] = await Promise.all([
      import("@/features/project/repository"),
      import("@/features/operators/repository"),
    ]);

    expect(projectRepository.getAll()).toEqual([]);
    expect(operatorRepository.getAll()).toEqual([]);
  });
});
