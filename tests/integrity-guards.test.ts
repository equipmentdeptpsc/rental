import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import type { ProjectRecord } from "@/features/project/types";
import type { Operator } from "@/features/operators/types";

const assignment = {
  id: "assignment-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
  assignedDate: "2026-07-01", expectedReturn: "", remarks: "", status: "Active" as const,
};

const rental = {
  id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1",
  customerId: "customer-1", projectId: "project-1", assignmentId: "assignment-1", customer: "Customer",
  project: "Project", rentedBy: "", dateOut: "2026-07-01", expectedReturn: "2026-07-02", statusId: "", status: "Closed" as const,
};

describe("relationship guards and persistence", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("blocks referenced project, operator, and customer records while allowing unused IDs", async () => {
    storage.set("assignments", [assignment]);
    storage.set("equipment-rental-records", [rental]);
    storage.set("equipment-rental-deur", [{
      id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
      workDate: "2026-07-01", logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
      totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft",
      createdAt: "2026-07-01", updatedAt: "2026-07-01",
    }]);
    storage.set("equipment-rental-contracts", [{
      id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1",
      rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 1, operatorIncluded: true,
      startDate: "", expectedEndDate: "", status: "Active", createdAt: "", updatedAt: "",
    }]);
    const { guardProjectDeletion, guardOperatorDeletion, guardCustomerDeletion } = await import("@/features/relationships/deletionGuards");

    expect(guardProjectDeletion("project-1").success).toBe(false);
    expect(guardOperatorDeletion("operator-1").success).toBe(false);
    expect(guardCustomerDeletion("customer-1").success).toBe(false);
    expect(guardProjectDeletion("unused-project").success).toBe(true);
    expect(guardOperatorDeletion("unused-operator").success).toBe(true);
    expect(guardCustomerDeletion("unused-customer").success).toBe(true);
  });

  it("persists project and operator records across fresh repository loads", async () => {
    const [{ projectRepository }, { operatorRepository }] = await Promise.all([
      import("@/features/project/repository"),
      import("@/features/operators/repository"),
    ]);
    const project: ProjectRecord = {
      id: "project-persisted", projectCode: "PRJ-000010", projectName: "Persisted", client: "", location: "",
      projectManager: "", startDate: "", targetCompletion: "", status: "Active",
    };
    const operator: Operator = {
      id: "operator-persisted", name: "Persisted Operator", email: "", licenseNumber: "", certificationType: "None",
      status: "Active", joinedDate: "",
    };
    projectRepository.create(project);
    operatorRepository.create(operator);

    vi.resetModules();
    const [{ projectRepository: reloadedProjects }, { operatorRepository: reloadedOperators }] = await Promise.all([
      import("@/features/project/repository"),
      import("@/features/operators/repository"),
    ]);
    expect(reloadedProjects.getById(project.id)).toMatchObject({ projectCode: "PRJ-000010" });
    expect(reloadedOperators.getById(operator.id)).toMatchObject({ name: "Persisted Operator" });
  });
});
