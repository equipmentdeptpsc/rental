import { beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/core/storage";
import { consumeDeurIntoBillingStatement, type BillingStatementWorkflowDependencies, type ConsumeDeurIntoBillingStatementCommand } from "@/features/rental/billingstatement/services/BillingStatementWorkflow";
import type { RentalAggregate } from "@/features/rental/aggregate";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";

function aggregate(): RentalAggregate {
  return {
    rentalEquipmentLines: [],
    rental: { id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1", customerId: "customer-1", projectId: "project-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-01-01", expectedReturn: "2026-01-02", statusId: "", status: "Returned" },
    equipment: { id: "equipment-1", prefixId: "", assetNo: "EQP-000001", equipmentName: "Excavator", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project-1", operatorId: "operator-1", status: "Available" },
    operator: { id: "operator-1", name: "Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" },
    contract: { id: "contract-1", contractNo: "C-001", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1", rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true, startDate: "2026-01-01", expectedEndDate: "2026-01-31", status: "Active", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    deurs: [],
    billing: { totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0, totalAdjustment: 0, subtotal: 0, invoiced: 0, collected: 0, outstanding: 0 },
  };
}

function acknowledgedDeur(overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-01-02", logs: [],
    totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    status: "Acknowledged", legacy: false, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T03:00:00.000Z",
    events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-01-02T00:00:00.000Z", sequence: 1, source: "user" },
      { id: "o1", activityType: "operation", action: "start", timestamp: "2026-01-02T01:00:00.000Z", sequence: 2, source: "user" },
      { id: "o2", activityType: "operation", action: "end", timestamp: "2026-01-02T02:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-01-02T03:00:00.000Z", sequence: 4, source: "user" },
    ],
    ...overrides,
  };
}

function command(overrides: Partial<ConsumeDeurIntoBillingStatementCommand> = {}): ConsumeDeurIntoBillingStatementCommand {
  return {
    deurId: "deur-1",
    expectedDeurUpdatedAt: "2026-01-02T03:00:00.000Z",
    statementInput: { aggregate: aggregate(), billingFrom: "2026-01-01", billingTo: "2026-01-31" },
    ...overrides,
  };
}

describe("DEUR billing statement consumption", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("creates one canonical statement, locks the same eligible DEUR, and survives reload", async () => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    const source = deurRepository.create(acknowledgedDeur());
    const original = structuredClone(source);
    const input = command();
    const result = consumeDeurIntoBillingStatement(input);

    expect(result).toMatchObject({ success: true, code: "SUCCESS", idempotent: false, statement: { rentalId: "rental-1", lines: [{ deurId: "deur-1" }] }, deur: { billingLocked: true } });
    if (!result.success) return;
    expect(result.statement.lines).toEqual([expect.objectContaining({ id: "deur-1", deurId: "deur-1", hours: 1, hourlyRate: 100, amount: 100 })]);
    expect(result.deur.billingStatementId).toBe(result.statement.id);
    expect(billingStatementRepository.getById(result.statement.id)?.lines).toHaveLength(1);
    expect(deurRepository.getById(source.id)).toMatchObject({ billingLocked: true, billingStatementId: result.statement.id });
    expect(source).toEqual(original);
    expect(input).toEqual(command());
    expect(() => JSON.stringify(result)).not.toThrow();

    vi.resetModules();
    const { deurRepository: reloadedDeurs } = await import("@/features/rental/deur/repository/deurRepository");
    expect(reloadedDeurs.getById(source.id)?.billingStatementId).toBe(result.statement.id);
  });

  it("ignores caller-supplied calculated values and persists canonical event-derived evidence", async () => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    deurRepository.create(acknowledgedDeur());
    const input = command({
      statementInput: {
        ...command().statementInput,
        line: { id: "other", deurId: "other-deur", operatingHours: 999, hourlyRate: 999, amount: 999 },
      } as unknown as ConsumeDeurIntoBillingStatementCommand["statementInput"],
    });

    const result = consumeDeurIntoBillingStatement(input);

    expect(result).toMatchObject({ success: true, statement: { lines: [
      { id: "deur-1", deurId: "deur-1", hours: 1, hourlyRate: 100, amount: 100 },
    ] } });
    expect(billingStatementRepository.getAll()).toHaveLength(1);
  });

  it("does not create a statement or update the DEUR when canonical calculation fails", async () => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    deurRepository.create(acknowledgedDeur());
    const invalidAggregate = aggregate();
    invalidAggregate.contract = { ...invalidAggregate.contract!, unitRate: Number.NaN };

    expect(consumeDeurIntoBillingStatement(command({
      statementInput: { ...command().statementInput, aggregate: invalidAggregate },
    }))).toMatchObject({ success: false, code: "CALCULATION_FAILED" });
    expect(billingStatementRepository.getAll()).toEqual([]);
    expect(deurRepository.getById("deur-1")?.billingLocked).toBeUndefined();
  });

  it("rejects eligibility failures without creating a statement or changing the DEUR", async () => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    deurRepository.create(acknowledgedDeur({ status: "Draft" }));
    const ineligible = consumeDeurIntoBillingStatement(command());
    expect(ineligible).toMatchObject({ success: false, code: "ELIGIBILITY_REJECTED", eligibility: { reasonCode: "NOT_ACKNOWLEDGED" } });
    expect(billingStatementRepository.getAll()).toEqual([]);
    expect(deurRepository.getById("deur-1")?.billingLocked).toBeUndefined();
  });

  it("rejects stale commands before statement creation or DEUR updates", async () => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    deurRepository.create(acknowledgedDeur());
    expect(consumeDeurIntoBillingStatement(command({ expectedDeurUpdatedAt: "stale" }))).toMatchObject({ success: false, code: "STALE_DEUR" });
    expect(billingStatementRepository.getAll()).toEqual([]);
    expect(deurRepository.getById("deur-1")?.billingLocked).toBeUndefined();
  });

  it.each([
    ["a mismatched rental", () => command({ statementInput: { ...command().statementInput, aggregate: { ...aggregate(), rental: { ...aggregate().rental, id: "other-rental" } } } })],
    ["a malformed runtime command", () => ({ deurId: 12, statementInput: null } as unknown as ConsumeDeurIntoBillingStatementCommand)],
    ["a blank billing period", () => command({ statementInput: { ...command().statementInput, billingFrom: "   " } })],
  ])("rejects %s without writes", async (_name, buildInvalidCommand) => {
    const [{ deurRepository }, { billingStatementRepository }] = await Promise.all([
      import("@/features/rental/deur/repository/deurRepository"),
      import("@/features/rental/billingstatement/repository"),
    ]);
    deurRepository.create(acknowledgedDeur());
    expect(consumeDeurIntoBillingStatement(buildInvalidCommand())).toMatchObject({ success: false, code: "INVALID_COMMAND" });
    expect(billingStatementRepository.getAll()).toEqual([]);
    expect(deurRepository.getById("deur-1")?.billingLocked).toBeUndefined();
  });

  it("reuses an existing matching DEUR-to-statement linkage without another write", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    deurRepository.create(acknowledgedDeur());
    const first = consumeDeurIntoBillingStatement(command());
    expect(first.success).toBe(true);
    const repeated = consumeDeurIntoBillingStatement(command({ expectedDeurUpdatedAt: undefined }));
    expect(repeated).toMatchObject({ success: true, code: "SUCCESS", idempotent: true });
    if (first.success && repeated.success) {
      expect(repeated.statement.id).toBe(first.statement.id);
      expect(repeated.deur.updatedAt).toBe(first.deur.updatedAt);
    }

    const { billingStatementRepository } = await import("@/features/rental/billingstatement/repository");
    expect(billingStatementRepository.getAll()).toHaveLength(1);

  });

  it("rejects conflicting statement links and existing billing markers without creating statements", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const { billingStatementRepository } = await import("@/features/rental/billingstatement/repository");
    storage.clear();
    deurRepository.create(acknowledgedDeur({ billingLocked: true, billingStatementId: "missing-statement" }));
    expect(consumeDeurIntoBillingStatement(command())).toMatchObject({ success: false, code: "DUPLICATE_CONSUMPTION" });
    expect(billingStatementRepository.getAll()).toHaveLength(0);

    storage.clear();
    deurRepository.create(acknowledgedDeur({ status: "Billed" }));
    expect(consumeDeurIntoBillingStatement(command())).toMatchObject({ success: false, code: "DUPLICATE_CONSUMPTION" });
    expect(billingStatementRepository.getAll()).toHaveLength(0);

    storage.clear();
    deurRepository.create(acknowledgedDeur({ billId: "legacy-bill" }));
    expect(consumeDeurIntoBillingStatement(command())).toMatchObject({ success: false, code: "DUPLICATE_CONSUMPTION" });
    expect(billingStatementRepository.getAll()).toHaveLength(0);
  });

  it("rejects linked statements from another rental or without the expected DEUR line", async () => {
    const { deurRepository } = await import("@/features/rental/deur/repository/deurRepository");
    const { billingStatementRepository } = await import("@/features/rental/billingstatement/repository");
    deurRepository.create(acknowledgedDeur());
    const created = consumeDeurIntoBillingStatement(command());
    expect(created.success).toBe(true);
    if (!created.success) return;

    storage.clear();
    billingStatementRepository.create({ ...created.statement, rentalId: "other-rental" });
    deurRepository.create(acknowledgedDeur({ billingLocked: true, billingStatementId: created.statement.id }));
    expect(consumeDeurIntoBillingStatement(command())).toMatchObject({ success: false, code: "DUPLICATE_CONSUMPTION" });
    expect(billingStatementRepository.getAll()).toHaveLength(1);

    storage.clear();
    billingStatementRepository.create({ ...created.statement, lines: [{ ...created.statement.lines[0], deurId: "other-deur" }] });
    deurRepository.create(acknowledgedDeur({ billingLocked: true, billingStatementId: created.statement.id }));
    expect(consumeDeurIntoBillingStatement(command())).toMatchObject({ success: false, code: "DUPLICATE_CONSUMPTION" });
    expect(billingStatementRepository.getAll()).toHaveLength(1);
  });

  it("does not update the DEUR when statement persistence fails", () => {
    const source = acknowledgedDeur();
    let updateCalls = 0;
    const dependencies: BillingStatementWorkflowDependencies = {
      statements: {
        getById: () => undefined,
        getByRentalId: () => [],
        create: () => { throw new Error("statement storage failure"); },
        delete: () => undefined,
      },
      deurs: {
        getById: () => source,
        update: () => { updateCalls += 1; return source; },
      },
    };

    expect(consumeDeurIntoBillingStatement(command(), dependencies)).toMatchObject({ success: false, code: "STATEMENT_CREATION_FAILED" });
    expect(updateCalls).toBe(0);
    expect(source.billingLocked).toBeUndefined();
  });

  it("compensates a created statement when DEUR persistence fails and reports compensation failure distinctly", () => {
    const source = acknowledgedDeur();
    const statements: BillingStatement[] = [];
    const baseDependencies = (deleteStatement: (id: string) => BillingStatement | undefined): BillingStatementWorkflowDependencies => ({
      statements: {
        getById: (id) => statements.find((statement) => statement.id === id),
        getByRentalId: () => [],
        create: (statement) => { statements.push(statement); },
        delete: deleteStatement,
      },
      deurs: { getById: () => source, update: () => { throw new Error("storage failure"); } },
    });

    const compensated = consumeDeurIntoBillingStatement(command(), baseDependencies((id) => {
      const index = statements.findIndex((statement) => statement.id === id);
      return index < 0 ? undefined : statements.splice(index, 1)[0];
    }));
    expect(compensated).toMatchObject({ success: false, code: "DEUR_UPDATE_FAILED" });
    expect(statements).toEqual([]);

    const compensationFailed = consumeDeurIntoBillingStatement(command(), baseDependencies(() => { throw new Error("rollback failure"); }));
    expect(compensationFailed).toMatchObject({ success: false, code: "COMPENSATION_FAILED" });
    expect(() => JSON.stringify(compensationFailed)).not.toThrow();
  });
});
