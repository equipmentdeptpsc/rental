import type { RentalAggregate } from "@/features/rental/aggregate";
import type { DeurRecord } from "@/features/rental/deur/types";
import { evaluateDeurBillingEligibility } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import { mapRentalContractToBillingCalculationTerms, resolveDeurBillingCalculationTerms } from "@/features/rental/billing/engine";
import { calculateDeurBillingStatementLine } from "./calculateDeurBillingStatementLine";
import { createBillingStatementForRental } from "./BillingStatementWorkflow";
import { billingStatementRepository } from "../repository";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import type { BillingStatement } from "../types";
import type { BillingPreviewLine } from "@/features/rental/workspace/billing/types";

export interface RentalLineBillingIssue { code: string; message: string; deurId?: string; rentalEquipmentLineId?: string; equipmentId?: string }
export interface RentalLineBillingPreview { lines: BillingPreviewLine[]; issues: RentalLineBillingIssue[]; subtotal: number; vat: number; withholdingTax: number; grandTotal: number }

export function buildRentalLineAwareBillingPreview(input: { aggregate: RentalAggregate; from: string; to: string }): RentalLineBillingPreview {
  const { aggregate, from, to } = input; const issues: RentalLineBillingIssue[] = []; const lines: BillingPreviewLine[] = [];
  const candidates = aggregate.deurs.filter((deur) => (deur.reportDate ?? deur.workDate) >= from && (deur.reportDate ?? deur.workDate) <= to);
  for (const deur of candidates) {
    const identity = { deurId: deur.id, rentalEquipmentLineId: deur.rentalEquipmentLineId, equipmentId: deur.equipmentId };
    const matchingLines = aggregate.rentalEquipmentLines.filter((line) => line.rentalId === deur.rentalId && (deur.rentalEquipmentLineId ? line.id === deur.rentalEquipmentLineId : line.equipmentId === deur.equipmentId));
    if (matchingLines.length !== 1) { issues.push({ ...identity, code: matchingLines.length ? "AMBIGUOUS_LEGACY_DEUR_LINE" : "DEUR_LINE_NOT_FOUND", message: matchingLines.length ? "Legacy DEUR matches multiple Rental Equipment Lines." : "DEUR Rental Equipment Line was not found." }); continue; }
    if (!deur.commercialSnapshot && !aggregate.contract) { issues.push({ ...identity, code: "COMMERCIAL_SNAPSHOT_REQUIRED", message: "DEUR embedded commercial snapshot is required for line-aware billing." }); continue; }
    const fallback = aggregate.contract ? mapRentalContractToBillingCalculationTerms(aggregate.contract) : undefined;
    if (!deur.commercialSnapshot && aggregate.rentalEquipmentLines.length !== 1) { issues.push({ ...identity, code: "AMBIGUOUS_LEGACY_COMMERCIAL_TERMS", message: "Legacy multi-line DEUR has no embedded commercial snapshot." }); continue; }
    const resolved = resolveDeurBillingCalculationTerms(deur, fallback!);
    const chainId = deur.revision?.chainId ?? deur.id; const revisionChain = aggregate.deurs.filter((item) => (item.revision?.chainId ?? item.id) === chainId);
    const eligibility = evaluateDeurBillingEligibility({ deur, billingMethod: resolved.terms.billingMethod, unitRate: resolved.terms.unitRate, revisionChain });
    if (!eligibility.eligible) { issues.push({ ...identity, code: eligibility.reasonCode, message: eligibility.reason }); continue; }
    const calculated = calculateDeurBillingStatementLine(deur, resolved.terms);
    if (!calculated.success) { issues.push({ ...identity, code: calculated.code, message: calculated.message }); continue; }
    lines.push({ ...calculated.line, deurReference: deur.deurNumber?.trim() || deur.id });
  }
  return { lines, issues, subtotal: lines.reduce((sum, line) => sum + line.amount, 0), vat: lines.reduce((sum, line) => sum + (line.vat ?? 0), 0), withholdingTax: lines.reduce((sum, line) => sum + (line.withholdingTax ?? 0), 0), grandTotal: lines.reduce((sum, line) => sum + (line.grandTotal ?? line.amount), 0) };
}

type StatementPort = Pick<typeof billingStatementRepository, "getByRentalId" | "create" | "delete">;
type DeurPort = Pick<typeof deurRepository, "getById" | "update">;
export function createRentalLineAwareBillingStatement(input: { aggregate: RentalAggregate; from: string; to: string; identity?: { id: string; statementNo: string } }, dependencies: { statements?: StatementPort; deurs?: DeurPort } = {}): { success: true; statement: BillingStatement; deurs: DeurRecord[] } | { success: false; code: string; message: string; issues?: RentalLineBillingIssue[] } {
  const preview = buildRentalLineAwareBillingPreview(input); if (preview.issues.length) return { success: false, code: "BILLING_ELIGIBILITY_FAILED", message: "Every DEUR in the billing period must be eligible before creating the Rental statement.", issues: preview.issues }; if (!preview.lines.length) return { success: false, code: "NO_BILLABLE_DEURS", message: "No eligible DEURs exist for the billing period." };
  const statements = dependencies.statements ?? billingStatementRepository; const deurs = dependencies.deurs ?? deurRepository;
  let creation: ReturnType<typeof createBillingStatementForRental>;
  try { creation = createBillingStatementForRental(input.aggregate, input.from, input.to, preview.lines, statements, { vat: preview.vat, withholdingTax: preview.withholdingTax, grandTotal: preview.grandTotal }, input.identity); }
  catch { return { success: false, code: "STATEMENT_CREATION_FAILED", message: "Billing statement persistence failed before any DEUR was consumed." }; }
  if (!creation.success) return { success: false, code: "STATEMENT_CREATION_FAILED", message: creation.message };
  const originals: DeurRecord[] = []; const persisted: DeurRecord[] = [];
  try {
    for (const line of preview.lines) { const current = deurs.getById(line.deurId); if (!current || current.billingLocked || current.billingStatementId || current.billId || current.status === "Billed") throw new Error("A DEUR became unavailable during statement creation."); originals.push(current); const updated = deurs.update({ ...current, billingLocked: true, billingStatementId: creation.statement.id, updatedAt: new Date().toISOString() }); if (!updated) throw new Error("DEUR consumption could not be persisted."); persisted.push(updated); }
    return { success: true, statement: creation.statement, deurs: persisted };
  } catch (error) {
    let compensated = true;
    for (const original of originals) { try { if (!deurs.update(original)) compensated = false; } catch { compensated = false; } }
    try { if (!statements.delete(creation.statement.id)) compensated = false; } catch { compensated = false; }
    return { success: false, code: compensated ? "BATCH_CONSUMPTION_FAILED" : "COMPENSATION_FAILED", message: compensated ? (error instanceof Error ? error.message : "Billing consumption failed and was compensated.") : "Billing consumption failed and local-storage compensation was incomplete; manual reconciliation is required." };
  }
}
