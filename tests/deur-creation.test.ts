import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";

const request = {
  rentalId: "rental-1",
  rentalStatus: "Released" as const,
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  assignmentId: "assignment-1",
  projectId: "project-1",
  customerId: "customer-1",
};

describe("DEUR creation", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("creates and persists one Draft DEUR with aggregate relationship IDs and scoped refresh", async () => {
    const [{ createDeur }, { deurRepository }, { subscribeRentalWorkspaceChange }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/workspace/workspaceRefresh"),
    ]);
    let matchingRefreshes = 0;
    let unrelatedRefreshes = 0;
    const stopMatching = subscribeRentalWorkspaceChange("rental-1", () => { matchingRefreshes += 1; });
    const stopUnrelated = subscribeRentalWorkspaceChange("rental-2", () => { unrelatedRefreshes += 1; });

    const result = createDeur(request);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.record).toMatchObject({
      rentalId: "rental-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      assignmentId: "assignment-1",
      projectId: "project-1",
      customerId: "customer-1",
      status: "Draft",
      logs: [],
    });
    expect(deurRepository.getById(result.record.id)).toEqual(result.record);
    expect(matchingRefreshes).toBe(1);
    expect(unrelatedRefreshes).toBe(0);
    stopMatching();
    stopUnrelated();

    vi.resetModules();
    const { deurRepository: reloadedRepository } = await import("@/features/rental/deur/repository/deurRepository");
    expect(reloadedRepository.getById(result.record.id)).toMatchObject({
      rentalId: "rental-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
    });
  });

  it("rejects missing relationships, ineligible rentals, and duplicate active DEURs without persisting placeholders", async () => {
    const [{ createDeur }, { deurRepository }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
    ]);

    expect(createDeur({ ...request, operatorId: "" })).toEqual({
      success: false,
      message: "Missing required operator relationship.",
    });
    expect(createDeur({ ...request, rentalStatus: "Cancelled" })).toEqual({
      success: false,
      message: "Cancelled rentals cannot create new DEUR records.",
    });
    expect(createDeur({ ...request, rentalStatus: "Closed" })).toEqual({
      success: false,
      message: "Closed rentals cannot create new DEUR records.",
    });

    expect(createDeur(request).success).toBe(true);
    expect(createDeur(request)).toEqual({
      success: false,
      message: "A DEUR already exists for this rental.",
    });
    expect(deurRepository.getAll()).toHaveLength(1);
    expect(deurRepository.getAll()[0]).not.toMatchObject({
      rentalId: "",
      equipmentId: "",
      operatorId: "",
    });
  });
});
