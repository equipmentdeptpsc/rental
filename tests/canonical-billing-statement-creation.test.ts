import { describe, expect, it, vi } from "vitest";

import { createCanonicalBillingStatement, type CanonicalBillingIdentity } from "@/features/rental/workspace/billing/createCanonicalBillingStatement";
import type { BillingFinancialCommandRepository, BillingEvidenceProjection } from "@/features/rental/operations/commands/contracts";
import type { BillingPreviewLine } from "@/features/rental/workspace/billing/types";

const line: BillingPreviewLine = {
  deurId: "deur-1", workDate: "2026-08-26", operator: "Operator", operatingHours: 3.8833,
  actualHours: 3.8833, billingMethod: "Per Hour", costCode: "UAT-CC-001", description: "Equipment rental",
  hourlyRate: 1000, unitRate: 1000, amount: 3883.33, vat: 0, withholdingTax: 0, grandTotal: 3883.33,
};
const evidence: BillingEvidenceProjection = {
  deurId: "deur-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1",
  workDate: "2026-08-26", billingMethod: "Per Hour", quantity: 3.8833, unit: "HOUR", unitRate: 1000,
  hours: 3.8833, hourlyRate: 1000, subtotal: 3883.3333, vat: 0, withholdingTax: 0, grandTotal: 3883.3333,
};
const identity: CanonicalBillingIdentity = {
  statementId: "statement-1",
  create: { commandId: "create-command", idempotencyKey: "create-key" },
  evidence: { "deur-1": { commandId: "evidence-command", idempotencyKey: "evidence-key" } },
  consumption: { "deur-1": { commandId: "consume-command", idempotencyKey: "consume-key", lineId: "line-1" } },
};
const accepted = <T,>(value: T) => ({ success: true as const, disposition: "ACCEPTED" as const, value, serverOccurredAt: "2026-08-27T00:00:00Z", refresh: [] });

function repository(overrides: Partial<BillingFinancialCommandRepository> = {}): BillingFinancialCommandRepository {
  return {
    generateEvidence: vi.fn().mockResolvedValue(accepted(evidence)),
    createStatement: vi.fn().mockResolvedValue(accepted({ statementId: "statement-1", approvalStatus: "Draft" as const, invoiceStatus: "Not Invoiced" as const, version: 1 })),
    consumeDeur: vi.fn().mockResolvedValue(accepted({ statementId: "statement-1", lineId: "line-1", deurId: "deur-1", statementVersion: 2, deurVersion: 4 })),
    finalizeStatement: vi.fn(), createInvoice: vi.fn(), updateInvoice: vi.fn(), ...overrides,
  };
}

describe("canonical billing statement creation", () => {
  it("verifies canonical evidence before creating and consuming with stable command identities", async () => {
    const calls: string[] = [];
    const repo = repository({
      generateEvidence: vi.fn(async (input) => { calls.push("evidence"); expect(input).toEqual({ ...identity.evidence["deur-1"], deurId: "deur-1" }); return accepted(evidence); }),
      createStatement: vi.fn(async (input) => { calls.push("statement"); expect(input).toEqual({ ...identity.create, statementId: "statement-1", rentalId: "rental-1", billingFrom: "2026-08-26", billingTo: "2026-08-26", currency: "PHP" }); return accepted({ statementId: "statement-1", approvalStatus: "Draft" as const, invoiceStatus: "Not Invoiced" as const, version: 1 }); }),
      consumeDeur: vi.fn(async (input) => { calls.push("consume"); expect(input).toMatchObject({ ...identity.consumption["deur-1"], statementId: "statement-1", deurId: "deur-1" }); return accepted({ statementId: "statement-1", lineId: "line-1", deurId: "deur-1", statementVersion: 2, deurVersion: 4 }); }),
    });
    await expect(createCanonicalBillingStatement({ rentalId: "rental-1", from: "2026-08-26", to: "2026-08-26", currency: "PHP", preview: [line], identity, repository: repo })).resolves.toEqual({ success: true, statementId: "statement-1" });
    expect(calls).toEqual(["evidence", "statement", "consume"]);
  });

  it("does not create canonical records when server evidence differs from the reviewed preview", async () => {
    const repo = repository({ generateEvidence: vi.fn().mockResolvedValue(accepted({ ...evidence, grandTotal: 4000 })) });
    const result = await createCanonicalBillingStatement({ rentalId: "rental-1", from: "2026-08-26", to: "2026-08-26", currency: "PHP", preview: [line], identity, repository: repo });
    expect(result).toEqual({ success: false, message: expect.stringContaining("grand total (4000 / 3883.33)") });
    expect(repo.createStatement).not.toHaveBeenCalled();
    expect(repo.consumeDeur).not.toHaveBeenCalled();
  });

  it("stops after a canonical command rejection and preserves the caller-owned retry identity", async () => {
    const failure = { success: false as const, code: "CONFLICT" as const, message: "Conflict", retryable: false, refreshRequired: true };
    const repo = repository({ createStatement: vi.fn().mockResolvedValue(failure) });
    await expect(createCanonicalBillingStatement({ rentalId: "rental-1", from: "2026-08-26", to: "2026-08-26", currency: "PHP", preview: [line], identity, repository: repo })).resolves.toEqual({ success: false, message: "Conflict" });
    expect(repo.consumeDeur).not.toHaveBeenCalled();
    expect(identity.statementId).toBe("statement-1");
    expect(identity.consumption["deur-1"].idempotencyKey).toBe("consume-key");
  });
});
