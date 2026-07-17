import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "@/core/storage";
import {
  getAssignmentProjectError,
  getRentalAssignmentPrefill,
  getRentalProjectOptions,
} from "@/features/rental/utils/rentalFormOptions";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { ProjectRecord } from "@/features/project/types";
import type { ProjectFormData } from "@/features/project/components/ProjectForm";

const assignment: AssignmentRecord = {
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  assignedDate: "2026-07-17",
  expectedReturn: "",
  remarks: "",
  status: "Active",
};

const project = (status: ProjectRecord["status"] = "Active"): ProjectRecord => ({
  id: "project-1",
  projectCode: "PRJ-000001",
  projectName: "UAT Project",
  client: "",
  location: "",
  projectManager: "",
  status,
});

describe("UAT workflow regressions", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("preloads stable assignment relationships and retains a valid active project", () => {
    expect(getRentalAssignmentPrefill(assignment)).toEqual({
      assignmentId: "assignment-1",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      projectId: "project-1",
    });
    expect(getAssignmentProjectError(assignment, [project()])).toBeUndefined();
    expect(getRentalProjectOptions([project()])).toEqual([
      { value: "project-1", label: "PRJ-000001 - UAT Project" },
    ]);
  });

  it("rejects missing or inactive projects inherited from an assignment", () => {
    expect(getAssignmentProjectError(assignment, [])).toBe("The assignment's project could not be found.");
    expect(getAssignmentProjectError(assignment, [project("Planning")])).toBe("The assignment's project is inactive.");
  });

  it("does not require legacy project dates for new project form data", () => {
    const data: ProjectFormData = {
      projectCode: "PRJ-000001",
      projectName: "UAT Project",
      customerId: "customer-1",
      location: "Site",
      projectManager: "Manager",
      status: "Planning",
    };
    expect(data).not.toHaveProperty("startDate");
    expect(data).not.toHaveProperty("targetCompletion");
    expect(project().startDate).toBeUndefined();
  });

  it("loads daily logs safely for empty, stored, and malformed storage", async () => {
    const { dailyLogRepository } = await import("@/features/daily-log/repository");
    expect(dailyLogRepository.getAll()).toEqual([]);
    dailyLogRepository.create({
      id: "log-1", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
      date: "2026-07-17", startReading: 1, endReading: 2, workingHours: 1, remarks: "",
    });
    expect(dailyLogRepository.getAll()).toHaveLength(1);
    localStorage.setItem("equipment-daily-logs", "{");
    expect(dailyLogRepository.getAll()).toEqual([]);
  });

  it("loads empty and persisted billing statements safely", async () => {
    const { billingStatementRepository } = await import("@/features/rental/billingstatement/repository");
    expect(billingStatementRepository.getAll()).toEqual([]);
    billingStatementRepository.create({
      id: "statement-1", statementNo: "BS-001", version: 1, rentalId: "rental-1", equipmentId: "equipment-1",
      operatorId: "operator-1", customer: "Customer", project: "Project", billingFrom: "2026-07-01",
      billingTo: "2026-07-31", subtotal: 100, approvalStatus: "Draft", invoiceStatus: "Not Invoiced",
      lines: [], createdBy: "System", createdAt: "2026-07-17T00:00:00.000Z",
    });
    expect(billingStatementRepository.getByRentalId("rental-1")).toHaveLength(1);
  });

  it("allows DEUR creation for Active rentals while retaining lifecycle reasons", async () => {
    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError({
      rentalId: "rental-1", rentalStatus: "Active", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
    })).toBeUndefined();
    expect(getDeurCreationError({
      rentalId: "rental-1", rentalStatus: "Draft", equipmentId: "equipment-1", operatorId: "operator-1", projectId: "project-1",
    })).toBe("Release the rental before creating a DEUR.");
  });
});
