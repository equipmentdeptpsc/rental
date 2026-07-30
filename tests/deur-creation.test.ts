import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";

const request = {
  rentalId: "rental-1",
  rentalStatus: "Active" as const,
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  assignmentId: "assignment-1",
  projectId: "project-1",
  customerId: "customer-1",
  rental: {
    id: "rental-1", equipmentId: "equipment-1", customer: "Customer", project: "Project", rentedBy: "Admin",
    dateOut: "2026-02-27", statusId: "active", status: "Active" as const,
    operationalMetadata: {
      costCode: { id: "cost-1", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { id: "activity-1", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    },
  },
  selectedWorkDescription: {
    id: "work-1", code: "MATERIAL_HAULING", name: "MATERIAL HAULING", active: true,
    operatorSelectable: true, requiresRemarks: false,
  },
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
      operationalMetadata: {
        costCode: { code: "5031HEAVYEQPT" },
        activityCode: { code: "LDC" },
        workDescription: { name: "MATERIAL HAULING" },
      },
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

  it("copies detached commercial terms into a Digital DEUR and rejects a new Rental missing them", async()=>{const {createDeur}=await import("@/features/rental/deur/services/CreateDeurService");const snapshot={billingMethod:"Per Hour" as const,unitRate:100,operatorIncluded:true,currency:"PHP",capturedAt:"2026-02-27T08:15:00.000Z"};const input:any=structuredClone({...request,rental:{...request.rental,commercialSnapshot:snapshot,commercialSnapshotRequired:true},billingMethod:"Per Hour"});const result=createDeur(input);expect(result.success).toBe(true);if(result.success){input.rental.commercialSnapshot.unitRate=999;expect(result.record.commercialSnapshot?.unitRate).toBe(100)}storage.clear();expect(createDeur({...request,rental:{...request.rental,commercialSnapshotRequired:true}})).toMatchObject({success:false,message:expect.stringContaining("commercial terms")})});

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
      message: "Rental must be Active before creating or starting a DEUR. Current status: Cancelled.",
    });
    expect(createDeur({ ...request, rentalStatus: "Closed" })).toEqual({
      success: false,
      message: "Rental must be Active before creating or starting a DEUR. Current status: Closed.",
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

  it("persists trimmed remarks and detached snapshots from Rental and Work Description inputs", async () => {
    const [{ createDeur }, { deurRepository }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
    ]);
    const source = structuredClone({
      ...request,
      remarks: "  special slope clearing  ",
      selectedWorkDescription: { ...request.selectedWorkDescription, code: "OTHER_OPERATION", name: "OTHER OPERATION", requiresRemarks: true },
    });
    const result = createDeur(source);
    expect(result.success).toBe(true);
    if (!result.success) return;
    source.rental.operationalMetadata!.costCode!.name = "Current Equipment value";
    source.rental.operationalMetadata!.activityCode!.name = "Current Assignment value";
    source.selectedWorkDescription.name = "Renamed master";
    source.selectedWorkDescription.requiresRemarks = false;
    expect(deurRepository.getById(result.record.id)).toMatchObject({
      operationalRemarks: "special slope clearing",
      operationalMetadata: {
        costCode: { name: "Heavy Equipment" },
        activityCode: { name: "LAUCHANCO DEVELOPMENT CORPORATION" },
        workDescription: { name: "OTHER OPERATION", requiresRemarks: true },
      },
    });
  });
});
