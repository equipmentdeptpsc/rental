import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";

const rentalKey = "equipment-rental-records";

describe("rental operator integrity", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("continues loading a legacy rental without an operator and preserves the DEUR prerequisite", async () => {
    const legacyRental = {
      id: "legacy-rental", equipmentId: "equipment-1", customer: "Customer", project: "Project", rentedBy: "",
      dateOut: "2026-01-01", statusId: "", status: "Active" as const,
    };
    const before = structuredClone(legacyRental);
    storage.set(rentalKey, [legacyRental]);

    const [{ rentalRepository }, { getDeurCreationError }] = await Promise.all([
      import("@/features/rental/repository"),
      import("@/features/rental/deur/services/CreateDeurService"),
    ]);
    const loaded = rentalRepository.getById("legacy-rental");

    expect(loaded).toEqual(legacyRental);
    expect(getDeurCreationError({
      rentalId: loaded!.id,
      rentalStatus: loaded!.status,
      equipmentId: loaded!.equipmentId,
      operatorId: loaded!.operatorId ?? "",
    })).toBe("Missing required operator relationship.");
    expect(legacyRental).toEqual(before);
  });
});
