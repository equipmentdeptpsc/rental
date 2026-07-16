import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import type { AssignmentRecord } from "@/features/assignment/types";

const record = (): AssignmentRecord => ({
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  assignedDate: "2026-07-17",
  expectedReturn: "",
  remarks: "Initial",
  status: "Active",
});

describe("assignment repository update", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("updates the existing assignment ID without creating a duplicate and reloads it", async () => {
    const { assignmentRepository } = await import("@/features/assignment/repository");
    assignmentRepository.create(record());
    assignmentRepository.update({ ...record(), remarks: "Updated" });

    expect(assignmentRepository.getAll()).toEqual([
      expect.objectContaining({ id: "assignment-1", remarks: "Updated" }),
    ]);

    vi.resetModules();
    const { assignmentRepository: reloadedRepository } = await import("@/features/assignment/repository");
    expect(reloadedRepository.getAll()).toHaveLength(1);
    expect(reloadedRepository.getById("assignment-1")?.remarks).toBe("Updated");
  });
});
