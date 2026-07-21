import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement, type ReactNode } from "react";

import { storage } from "@/core/storage";
import { buildCloseReadiness } from "@/features/rental/workspace/closing/CloseReadinessBuilder";
import {
  canTransitionRental,
  getRentalTransitionError,
} from "@/features/rental/services/RentalWorkflowRules";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalLifecycleStatus, RentalRecord } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import type { RentalCommercialTermsInput } from "@/features/rental/services/configureRentalCommercialTerms";

const equipmentKey = "equipment-records";
const assignmentKey = "assignments";
const rentalKey = "equipment-rental-records";
const authUserKey = "auth_user";
const authTokenKey = "auth_token";
const projectKey = "projects";
const operatorKey = "operators";
const contractKey = "equipment-rental-contracts";

function contract(unitRate = 100): RentalContractRecord {
  return {
    id: "rental-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1",
    projectId: "project-1", rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP",
    unitRate, operatorIncluded: true, startDate: "2026-07-17", expectedEndDate: "2026-07-18",
    status: "Active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

const commercialTerms = (unitRate = 100): RentalCommercialTermsInput => ({
  billingMethod: "Per Hour", currency: "PHP", unitRate, operatorIncluded: true,
  transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable", taxRate: 12,
});

function equipment(status: EquipmentRecord["status"]): EquipmentRecord {
  return {
    id: "equipment-1",
    prefixId: "test",
    assetNo: "EQ-001",
    equipmentName: "Test Equipment",
    category: "Moving Equipment",
    maintenanceType: "Engine Hours",
    currentReading: 0,
    projectId: "project-1",
    operatorId: "operator-1",
    status,
    deleted: false,
  };
}

function rental(status: RentalLifecycleStatus, assignmentId?: string): RentalRecord {
  return {
    id: "rental-1",
    rentalNumber: "R-001",
    equipmentId: "equipment-1",
    customerId: "customer-1",
    projectId: "project-1",
    operatorId: "operator-1",
    assignmentId,
    customer: "Test Customer",
    project: "Test Project",
    rentedBy: "Test User",
    dateOut: "2026-07-17",
    expectedReturn: "2026-07-18",
    rentalType: "Operated Rental",
    billingMethod: "Per Hour",
    statusId: "reserved",
    status,
  };
}

const activeAssignment: AssignmentRecord = {
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: "operator-1",
  projectId: "project-1",
  assignedDate: "2026-07-17",
  expectedReturn: "2026-07-18",
  remarks: "",
  status: "Active",
};

interface RentalHarness {
  rental: ReturnType<typeof import("@/features/rental/context/RentalContext")["useRental"]>;
  equipment: ReturnType<typeof import("@/features/equipment/context/EquipmentContext")["useEquipment"]>;
  assignment: ReturnType<typeof import("@/features/assignment/context/AssignmentContext")["useAssignment"]>;
  history: ReturnType<typeof import("@/features/equipment/history/EquipmentHistoryContext")["useEquipmentHistory"]>;
  audit: ReturnType<typeof import("@/features/equipment/audit/AuditContext")["useAudit"]>;
}

async function renderHarness(): Promise<{ harness: RentalHarness; root: Root; container: HTMLDivElement }> {
  vi.resetModules();
  const [{ AuthProvider }, { AuditProvider, useAudit }, { EquipmentProvider, useEquipment },
    { EquipmentHistoryProvider, useEquipmentHistory }, { AssignmentProvider, useAssignment },
    { OperatorProvider }, { ProjectProvider },
    { RentalProvider, useRental }] = await Promise.all([
    import("@/features/auth/AuthContext"),
    import("@/features/equipment/audit/AuditContext"),
    import("@/features/equipment/context/EquipmentContext"),
    import("@/features/equipment/history/EquipmentHistoryContext"),
    import("@/features/assignment/context/AssignmentContext"),
    import("@/features/operators/context/OperatorContext"),
    import("@/features/project/context/ProjectContext"),
    import("@/features/rental/context/RentalContext"),
  ]);
  const harness = {} as RentalHarness;
  function Probe() {
    harness.rental = useRental();
    harness.equipment = useEquipment();
    harness.assignment = useAssignment();
    harness.history = useEquipmentHistory();
    harness.audit = useAudit();
    return null;
  }
  const providers = (children: ReactNode) => createElement(
    AuthProvider,
    null,
    createElement(
      AuditProvider,
      null,
      createElement(
        EquipmentProvider,
        null,
        createElement(
          EquipmentHistoryProvider,
          null,
          createElement(
            OperatorProvider,
            null,
            createElement(
              ProjectProvider,
              null,
              createElement(AssignmentProvider, null, createElement(RentalProvider, null, children))
            )
          )
        )
      )
    )
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(providers(createElement(Probe)));
  });
  return { harness, root, container };
}

function prepareState(status: EquipmentRecord["status"], rentalStatus: RentalLifecycleStatus, assignment?: AssignmentRecord) {
  storage.set(equipmentKey, [equipment(status)]);
  storage.set(rentalKey, [rental(rentalStatus, assignment?.id)]);
  storage.set(assignmentKey, assignment ? [assignment] : []);
  storage.set(authUserKey, { id: "user-1", name: "Test Admin", role: "Admin" });
  storage.set(authTokenKey, "token");
}

function prepareCreateState(status: EquipmentRecord["status"], assignment?: AssignmentRecord) {
  storage.set(equipmentKey, [equipment(status)]);
  storage.set(rentalKey, []);
  storage.set(assignmentKey, assignment ? [assignment] : []);
  storage.set(projectKey, [{
    id: "project-1", projectCode: "PRJ-000001", projectName: "Test Project", client: "", location: "",
    projectManager: "", startDate: "", targetCompletion: "", status: "Active",
  }]);
  storage.set(operatorKey, [{
    id: "operator-1", name: "Test Operator", email: "", licenseNumber: "", certificationType: "None",
    status: "Active", joinedDate: "",
  }]);
}

describe("rental lifecycle rules", () => {
  it("allows the required lifecycle path and rejects skipped transitions", () => {
    const path: RentalLifecycleStatus[] = [
      "Draft", "Assigned", "Reserved", "Released", "Active", "Returned", "Closed",
    ];

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionRental({ status: path[index] }, path[index + 1])).toBe(true);
    }

    expect(getRentalTransitionError({ status: "Draft" }, "Released")).toContain("cannot transition");
    expect(getRentalTransitionError({ status: "Released" }, "Cancelled")).toContain("cannot transition");
    expect(getRentalTransitionError({ status: "Active" }, "Closed")).toContain("cannot transition");
    expect(getRentalTransitionError({ status: "Reserved" }, "Returned")).toContain("cannot transition");
  });

  it("requires a Returned rental and a ready aggregate before close", () => {
    expect(canTransitionRental({ status: "Active" }, "Closed")).toBe(false);
    expect(canTransitionRental({ status: "Returned" }, "Closed")).toBe(true);
    expect(buildCloseReadiness({
      rental: rental("Returned"),
      rentalEquipmentLines: [],
      deurs: [],
      billing: {
        totalOperatingCharge: 0,
        totalIdleCharge: 0,
        totalMobilizationCharge: 0,
        totalDemobilizationCharge: 0,
        totalAdjustment: 0,
        subtotal: 100,
        invoiced: 0,
        collected: 0,
        outstanding: 100,
      },
    }).canClose).toBe(false);
  });
});

describe("RentalProvider synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00"));
    storage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("synchronizes release, return, assignment completion, audit, history, and close", async () => {
    prepareState("Assigned", "Draft", activeAssignment);
    const { harness, root, container } = await renderHarness();

    await act(async () => {
      expect(harness.rental.transitionRental("rental-1", "Assigned").success).toBe(true);
      expect(harness.rental.transitionRental("rental-1", "Reserved").success).toBe(true);
      expect(harness.rental.releaseRental("rental-1", "Test Admin").success).toBe(true);
    });
    expect(harness.equipment.getEquipment("equipment-1")?.status).toBe("Rented");
    expect(harness.rental.getRental("rental-1")?.rentedBy).toBe("Test Admin");

    await act(async () => {
      expect(harness.rental.transitionRental("rental-1", "Active").success).toBe(true);
      expect(harness.rental.returnRental("rental-1").success).toBe(true);
    });
    expect(harness.rental.getRental("rental-1")?.status).toBe("Returned");
    expect(harness.equipment.getEquipment("equipment-1")).toMatchObject({
      status: "Available",
      projectId: "",
      operatorId: "",
    });
    expect(harness.assignment.getAssignment("assignment-1")?.status).toBe("Completed");
    expect(harness.audit.logs.some((entry) => entry.equipmentId === "equipment-1")).toBe(true);
    expect(harness.history.getHistory("equipment-1").some((entry) => entry.type === "RENTAL_RETURN")).toBe(true);

    await act(async () => {
      expect(harness.rental.transitionRental("rental-1", "Closed").success).toBe(true);
    });
    expect(harness.rental.getRental("rental-1")?.status).toBe("Closed");
    await act(async () => root.unmount());
    container.remove();
  });

  it("freezes a required DEUR expectation policy at release and rejects a marked Rental without one", async () => {
    prepareState("Assigned", "Reserved", activeAssignment);
    storage.set(rentalKey, [{ ...rental("Reserved", activeAssignment.id), deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-07-17", timezone: "Asia/Manila", capturedAt: "2026-07-16T00:00:00Z" } }]);
    const first = await renderHarness();
    await act(async () => expect(first.harness.rental.releaseRental("rental-1", "Test Admin").success).toBe(true));
    expect(first.harness.rental.getRental("rental-1")).toMatchObject({ status: "Released", deurExpectationPolicyFrozenAt: expect.any(String), deurExpectationPolicy: { capturedAt: expect.any(String) } });
    await act(async () => first.root.unmount()); first.container.remove();

    storage.clear(); vi.resetModules(); prepareState("Assigned", "Reserved", activeAssignment);
    storage.set(rentalKey, [{ ...rental("Reserved", activeAssignment.id), deurExpectationPolicyRequired: true }]);
    const second = await renderHarness();
    await act(async () => expect(second.harness.rental.releaseRental("rental-1", "Test Admin")).toMatchObject({ success: false, message: expect.stringContaining("expectation policy") }));
    expect(second.harness.rental.getRental("rental-1")?.status).toBe("Reserved");
    await act(async () => second.root.unmount()); second.container.remove();
  });

  it("captures required commercial terms exactly once at release without migrating legacy Rentals", async () => {
    prepareState("Assigned", "Reserved", activeAssignment);
    storage.set(rentalKey, [{ ...rental("Reserved", activeAssignment.id), commercialSnapshotRequired: true }]);
    storage.set(contractKey, [contract(100)]);
    const current = await renderHarness();

    expect(current.harness.rental.getRental("rental-1")?.commercialSnapshot).toBeUndefined();
    await act(async () => expect(current.harness.rental.releaseRental("rental-1", "Test Admin")).toMatchObject({ success: true }));
    const captured = current.harness.rental.getRental("rental-1")?.commercialSnapshot;
    expect(captured).toMatchObject({ billingMethod: "Per Hour", unitRate: 100, currency: "PHP", capturedAt: "2026-07-17T04:00:00.000Z" });

    await act(async () => {
      current.harness.rental.updateContract(contract(999));
      expect(current.harness.rental.transitionRental("rental-1", "Active").success).toBe(true);
    });
    expect(current.harness.rental.getRental("rental-1")?.commercialSnapshot).toEqual(captured);
    await act(async () => current.root.unmount()); current.container.remove();

    storage.clear(); vi.resetModules(); prepareState("Assigned", "Reserved", activeAssignment);
    storage.set(contractKey, [contract(100)]);
    const legacy = await renderHarness();
    await act(async () => expect(legacy.harness.rental.releaseRental("rental-1", "Test Admin")).toMatchObject({ success: true }));
    expect(legacy.harness.rental.getRental("rental-1")?.commercialSnapshot).toBeUndefined();
    expect(legacy.harness.rental.getRental("rental-1")?.commercialSnapshotRequired).toBeUndefined();
    await act(async () => legacy.root.unmount()); legacy.container.remove();
  });

  it("persists configured pre-release terms, releases with a snapshot, locks editing, and enables DEUR", async () => {
    prepareState("Assigned", "Reserved", activeAssignment);
    storage.set(rentalKey, [{
      ...rental("Reserved", activeAssignment.id), commercialSnapshotRequired: true,
      operationalMetadata: { costCode: { code: "C", name: "Cost" }, activityCode: { code: "A", name: "Activity" } },
    }]);
    const first = await renderHarness();

    await act(async () => expect(first.harness.rental.releaseRental("rental-1", "Test Admin")).toMatchObject({ success: false, message: expect.stringContaining("commercial terms") }));
    expect(first.harness.rental.getRental("rental-1")?.status).toBe("Reserved");
    await act(async () => expect(first.harness.rental.saveCommercialTerms("rental-1", commercialTerms())).toMatchObject({ success: true }));
    expect(first.harness.rental.getContract("rental-1")).toMatchObject({ unitRate: 100, billingMethod: "Per Hour", currency: "PHP" });
    await act(async () => first.root.unmount()); first.container.remove();

    vi.resetModules();
    const refreshed = await renderHarness();
    expect(refreshed.harness.rental.getContract("rental-1")).toMatchObject({ unitRate: 100, billingMethod: "Per Hour" });
    await act(async () => expect(refreshed.harness.rental.releaseRental("rental-1", "Test Admin")).toMatchObject({ success: true }));
    const released = refreshed.harness.rental.getRental("rental-1")!;
    expect(released).toMatchObject({ status: "Released", commercialSnapshot: { unitRate: 100, billingMethod: "Per Hour", currency: "PHP" } });
    await act(async () => expect(refreshed.harness.rental.saveCommercialTerms("rental-1", commercialTerms(999))).toMatchObject({ success: false, message: expect.stringContaining("read-only") }));
    expect(refreshed.harness.rental.getContract("rental-1")?.unitRate).toBe(100);

    const { getDeurCreationError } = await import("@/features/rental/deur/services/CreateDeurService");
    expect(getDeurCreationError({ rentalId: released.id, rentalStatus: released.status, rental: released, equipmentId: released.equipmentId, operatorId: released.operatorId ?? "", assignmentId: released.assignmentId, projectId: released.projectId, customerId: released.customerId })).toBeUndefined();
    await act(async () => refreshed.root.unmount()); refreshed.container.remove();
  });

  it("returns equipment to Available when a reservation without an assignment is cancelled", async () => {
    prepareState("Available", "Draft");
    const { harness, root, container } = await renderHarness();

    await act(async () => {
      harness.rental.transitionRental("rental-1", "Assigned");
      harness.rental.transitionRental("rental-1", "Reserved");
      expect(harness.rental.transitionRental("rental-1", "Cancelled").success).toBe(true);
    });
    expect(harness.equipment.getEquipment("equipment-1")).toMatchObject({
      status: "Available",
      projectId: "",
      operatorId: "",
    });
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps active-assignment equipment Assigned when a reservation is cancelled", async () => {
    prepareState("Assigned", "Draft", activeAssignment);
    const { harness, root, container } = await renderHarness();

    await act(async () => {
      harness.rental.transitionRental("rental-1", "Assigned");
      harness.rental.transitionRental("rental-1", "Reserved");
      expect(harness.rental.transitionRental("rental-1", "Cancelled").success).toBe(true);
    });
    expect(harness.equipment.getEquipment("equipment-1")).toMatchObject({
      status: "Assigned",
      projectId: "project-1",
      operatorId: "operator-1",
    });
    await act(async () => root.unmount());
    container.remove();
  });

  it("accepts equipment assigned to its own assignment and rejects equipment assigned elsewhere", async () => {
    prepareCreateState("Assigned", activeAssignment);
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft", activeAssignment.id);

    await act(async () => {
      expect(harness.rental.addRental(request).success).toBe(true);
    });
    expect(harness.rental.getRental("rental-1")?.status).toBe("Reserved");
    expect("status" in request).toBe(false);

    await act(async () => root.unmount());
    container.remove();

    storage.clear();
    vi.resetModules();
    prepareCreateState("Assigned", { ...activeAssignment, id: "other-assignment" });
    const second = await renderHarness();
    const { assignmentId: _assignmentId, ...unlinkedRequest } = request;

    const beforeFailure = { ...unlinkedRequest };
    await act(async () => {
      expect(second.harness.rental.addRental(unlinkedRequest).success).toBe(false);
    });
    expect(unlinkedRequest).toEqual(beforeFailure);
    await act(async () => second.root.unmount());
    second.container.remove();
  });

  it("creates a long-term rental without an expected return and records actual creation and reservation timestamps", async () => {
    prepareCreateState("Assigned", activeAssignment);
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, expectedReturn: _expectedReturn, ...request } = rental("Draft", activeAssignment.id);

    await act(async () => {
      expect(harness.rental.addRental(request).success).toBe(true);
    });

    expect(harness.rental.getRental("rental-1")).toMatchObject({
      expectedReturn: undefined,
      status: "Reserved",
    });
    expect(harness.rental.getRental("rental-1")?.createdAt).toBeTruthy();
    expect(harness.rental.getRental("rental-1")?.reservedAt).toBeTruthy();
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires a customer and prevents repeated rental submissions for the same equipment", async () => {
    prepareCreateState("Available");
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft");
    const before = structuredClone(request);

    await act(async () => {
      expect(harness.rental.addRental({ ...request, customerId: "", customer: "" })).toMatchObject({
        success: false,
        message: "Select a customer before creating a rental.",
      });
      expect(harness.rental.addRental(request).success).toBe(true);
      expect(harness.rental.addRental({ ...request, id: "rental-2", rentalNumber: "R-002" })).toMatchObject({
        success: false,
        message: "Equipment already has a non-final rental.",
      });
    });

    expect(harness.rental.rentals).toHaveLength(1);
    expect(request).toEqual(before);
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires an operator for manual rentals and persists a selected operator", async () => {
    prepareCreateState("Available");
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft");
    const before = structuredClone(request);

    await act(async () => {
      expect(harness.rental.addRental({ ...request, operatorId: "" })).toMatchObject({
        success: false,
        message: "Select an operator before creating a rental.",
      });
      expect(harness.rental.addRental(request).success).toBe(true);
    });

    expect(harness.rental.getRental("rental-1")?.operatorId).toBe("operator-1");
    expect(request).toEqual(before);
    await act(async () => root.unmount());
    container.remove();
  });

  it("applies the same equipment guard to assignment-started rentals", async () => {
    prepareCreateState("Assigned", activeAssignment);
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft", activeAssignment.id);

    await act(async () => {
      expect(harness.rental.addRental(request).success).toBe(true);
      expect(harness.rental.addRental({ ...request, id: "rental-2", rentalNumber: "R-002" })).toMatchObject({
        success: false,
        message: "Equipment already has a non-final rental.",
      });
    });

    expect(harness.rental.rentals).toHaveLength(1);
    expect(harness.rental.getRental("rental-1")?.operatorId).toBe(activeAssignment.operatorId);
    await act(async () => root.unmount());
    container.remove();
  });

  it("uses a newly loaded assignment when saving an assignment-started rental", async () => {
    prepareCreateState("Assigned");
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft", activeAssignment.id);
    const before = structuredClone(request);

    await act(async () => {
      expect(harness.assignment.addAssignment(activeAssignment)).toBe(true);
    });

    await act(async () => {
      expect(harness.rental.addRental(request)).toMatchObject({ success: true });
    });

    expect(harness.rental.getRental("rental-1")).toMatchObject({
      assignmentId: activeAssignment.id,
      equipmentId: activeAssignment.equipmentId,
      operatorId: activeAssignment.operatorId,
      projectId: activeAssignment.projectId,
    });
    expect(request).toEqual(before);
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps equipment rented when returning a corrupted duplicate active rental", async () => {
    prepareState("Rented", "Active");
    storage.set(rentalKey, [rental("Active"), { ...rental("Active"), id: "rental-2", rentalNumber: "R-002" }]);
    const { harness, root, container } = await renderHarness();

    await act(async () => {
      expect(harness.rental.returnRental("rental-1").success).toBe(true);
    });

    expect(harness.equipment.getEquipment("equipment-1")?.status).toBe("Rented");
    expect(harness.rental.getRental("rental-2")?.status).toBe("Active");
    await act(async () => root.unmount());
    container.remove();
  });

  it("captures both operational snapshots before persisting an Assignment rental", async () => {
    const configuredAssignment = { ...activeAssignment, activityCodeId: "activity-ldc" };
    prepareCreateState("Assigned", configuredAssignment);
    storage.set(equipmentKey, [{ ...equipment("Assigned"), costCodeId: "cost-heavy" }]);
    storage.set("equipment-rental-cost-codes", [{
      id: "cost-heavy", code: "5031HEAVYEQPT", description: "Heavy Equipment",
      defaultRate: 0, unit: "Hour", active: true, deleted: false,
    }]);
    storage.set("equipment-rental-activity-codes", [{
      id: "activity-ldc", activityCode: "LDC", description: "LAUCHANCO DEVELOPMENT CORPORATION",
      active: true, deleted: false,
    }]);
    const { harness, root, container } = await renderHarness();
    const { status: _status, statusId: _statusId, ...request } = rental("Draft", configuredAssignment.id);

    await act(async () => {
      expect(harness.rental.addRental(request).success).toBe(true);
    });
    expect(harness.rental.getRental("rental-1")?.operationalMetadata).toEqual({
      costCode: { id: "cost-heavy", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
      activityCode: { id: "activity-ldc", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
    });
    await act(async () => root.unmount());
    container.remove();
  });
});
