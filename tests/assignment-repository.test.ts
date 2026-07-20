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

  it("persists and edits Activity Code without changing identity or unrelated fields", async () => {
    const { assignmentRepository } = await import("@/features/assignment/repository");
    const created = { ...record(), activityCodeId: "activity-code-ldc" };
    assignmentRepository.create(created);

    expect(assignmentRepository.getById(created.id)?.activityCodeId)
      .toBe("activity-code-ldc");

    assignmentRepository.update({ ...created, activityCodeId: "activity-code-scm" });
    expect(assignmentRepository.getById(created.id)).toMatchObject({
      id: "assignment-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      projectId: "project-1",
      remarks: "Initial",
      status: "Active",
      activityCodeId: "activity-code-scm",
    });
  });

  it("loads and reserializes legacy Assignment without Activity Code or data loss", async () => {
    storage.set("assignments", [record()]);
    const { assignmentRepository } = await import("@/features/assignment/repository");

    const legacy = assignmentRepository.getById("assignment-1");
    expect(legacy?.activityCodeId).toBeUndefined();
    assignmentRepository.update({ ...legacy!, remarks: "Legacy updated" });

    vi.resetModules();
    const { assignmentRepository: reloaded } = await import("@/features/assignment/repository");
    expect(reloaded.getById("assignment-1")).toMatchObject({
      id: "assignment-1",
      equipmentId: "equipment-1",
      remarks: "Legacy updated",
    });
    expect(reloaded.getById("assignment-1")?.activityCodeId).toBeUndefined();
  });

  it("returns detached Assignment records", async () => {
    const { assignmentRepository } = await import("@/features/assignment/repository");
    assignmentRepository.create({ ...record(), activityCodeId: "activity-code-ldc" });

    const found = assignmentRepository.getById("assignment-1")!;
    found.activityCodeId = "mutated";
    const listed = assignmentRepository.getAll();
    listed[0].remarks = "mutated";

    expect(assignmentRepository.getById("assignment-1")).toMatchObject({
      activityCodeId: "activity-code-ldc",
      remarks: "Initial",
    });
  });
});
