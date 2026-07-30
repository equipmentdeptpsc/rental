import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import type { CreateDeurRequest } from "@/features/rental/deur/services/CreateDeurService";

const request = (rentalStatus: CreateDeurRequest["rentalStatus"]): CreateDeurRequest => ({
  rentalId: "rental-1",
  rentalStatus,
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  assignmentId: "assignment-1",
  projectId: "project-1",
  customerId: "customer-1",
  rental: {
    id: "rental-1", equipmentId: "equipment-1", customer: "Customer", project: "Project", rentedBy: "Admin",
    dateOut: "2026-02-27", statusId: "released", status: rentalStatus,
    operationalMetadata: {
      costCode: { code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    },
  },
  selectedWorkDescription: {
    id: "work-1", code: "MATERIAL_HAULING", name: "MATERIAL HAULING", active: true,
    operatorSelectable: true, requiresRemarks: false,
  },
});

describe("Daily Operations DEUR creation lifecycle guard", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("allows Create DEUR only for Active rentals", async () => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError(request("Active"))).toBeUndefined();
  });

  it.each(["Draft", "Assigned", "Reserved", "Released", "Returned", "Closed", "Cancelled"] as const)(
    "blocks %s rentals until activation",
    async (rentalStatus) => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError(request(rentalStatus))).toBe(
      `Rental must be Active before creating or starting a DEUR. Current status: ${rentalStatus}.`,
    );
  });

  it("keeps an existing DEUR available without mutating its data or the rental request", async () => {
    const [{ createDeur, getDeurCreationError }, { deurRepository }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
    ]);
    const sourceRequest = request("Active");
    const sourceRequestBeforeCheck = structuredClone(sourceRequest);
    const created = createDeur(sourceRequest);
    expect(created.success).toBe(true);
    if (!created.success) return;

    const sourceDeurBeforeCheck = structuredClone(created.record);
    expect(getDeurCreationError(sourceRequest)).toBe("A DEUR already exists for this rental.");
    expect(sourceRequest).toEqual(sourceRequestBeforeCheck);
    expect(deurRepository.getById(created.record.id)).toEqual(sourceDeurBeforeCheck);
  });
});
