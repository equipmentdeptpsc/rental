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
});

describe("Daily Operations DEUR creation lifecycle guard", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it.each(["Released", "Active"] as const)("allows Create DEUR for %s rentals", async (rentalStatus) => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError(request(rentalStatus))).toBeUndefined();
  });

  it.each(["Draft", "Assigned", "Reserved"] as const)("blocks %s rentals until release", async (rentalStatus) => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError(request(rentalStatus))).toBe("Release the rental before creating a DEUR.");
  });

  it("does not tell a Returned rental to release again", async () => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    const error = getDeurCreationError(request("Returned"));

    expect(error).toBe("Returned rentals cannot create new DEUR records.");
    expect(error).not.toContain("Release the rental");
  });

  it.each([
    ["Closed", "Closed rentals cannot create new DEUR records."],
    ["Cancelled", "Cancelled rentals cannot create new DEUR records."],
  ] as const)("blocks final %s rentals with final-state guidance", async (rentalStatus, message) => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError(request(rentalStatus))).toBe(message);
  });

  it("keeps an existing DEUR available without mutating its data or the rental request", async () => {
    const [{ createDeur, getDeurCreationError }, { deurRepository }] = await Promise.all([
      import("@/features/rental/deur/services/CreateDeurService"),
      import("@/features/rental/deur/repository/deurRepository"),
    ]);
    const sourceRequest = request("Released");
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
