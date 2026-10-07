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
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import { resolveBillingConsumedPresentation, type BillingConsumedNotice } from "@/features/rental/workspace/billing/resolveBillingConsumedPresentation";
import type { User } from "@/features/auth/domain/user";

export interface RentalLineBillingIssue { code: string; message: string; deurId?: string; rentalEquipmentLineId?: string; equipmentId?: string }
export interface RentalLineBillingPreview { lines: BillingPreviewLine[]; issues: RentalLineBillingIssue[]; notices: BillingConsumedNotice[]; subtotal: number; vat: number; withholdingTax: number; grandTotal: number }

export function buildRentalLineAwareBillingPreview(input: { aggregate: RentalAggregate; from: string; to: string; equipment?: EquipmentRecord[]; operators?: Operator[] }): RentalLineBillingPreview {
  const { aggregate, from, to } = input; const issues: RentalLineBillingIssue[] = []; const notices: BillingConsumedNotice[] = []; const lines: BillingPreviewLine[] = [];
  const financialGroups = new Map<string, { lineIds: string[]; discountType: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number; vatRate: number; vatApplicable: boolean; withholdingRate: number }>();
  const statements = billingStatementRepository.getByRentalId(aggregate.rental.id);
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
    if (!eligibility.eligible) {
      if (["BILLING_LOCKED", "ALREADY_BILLED", "DEUR_REVISION_ALREADY_CONSUMED"].includes(eligibility.reasonCode)) {
        notices.push(resolveBillingConsumedPresentation({ aggregate, deur, equipment: input.equipment, statements }));
      } else {
        issues.push({ ...identity, code: eligibility.reasonCode, message: eligibility.reason });
      }
      continue;
    }
    const calculated = calculateDeurBillingStatementLine(deur, resolved.terms);
    if (!calculated.success) { issues.push({ ...identity, code: calculated.code, message: calculated.message }); continue; }
    const machine=input.equipment?.find(item=>item.id===deur.equipmentId),operator=input.operators?.find(item=>item.id===deur.operatorId);
    lines.push({ ...calculated.line, deurReference: deur.deurNumber?.trim()?`${deur.deurNumber}${deur.revision?.revisionNumber?` R${deur.revision.revisionNumber}`:""}`:"DEUR number unavailable",equipmentLabel:machine?`${machine.equipmentName} (${machine.assetNo})`:"Equipment record unavailable",operatorLabel:operator?.name??"Operator not assigned" });
    const groupKey = matchingLines[0].id;
    const group = financialGroups.get(groupKey) ?? { lineIds: [], discountType: resolved.terms.discountType ?? "NONE", discountValue: resolved.terms.discountValue ?? 0, vatRate: resolved.terms.taxRate ?? 0, vatApplicable: resolved.terms.vatApplicability === "Applicable" || (resolved.terms.vatApplicability === undefined && (resolved.terms.taxRate ?? 0) > 0), withholdingRate: resolved.terms.withholdingTax ?? 0 };
    group.lineIds.push(deur.id); financialGroups.set(groupKey, group);
  }
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
  for (const [groupKey, group] of financialGroups) {
    const members = lines.filter(line => group.lineIds.includes(line.deurId)).sort((left, right) => left.deurId.localeCompare(right.deurId));
    const gross = members.reduce((sum, line) => sum + line.amount, 0);
    if (group.discountType === "FIXED_AMOUNT" && group.discountValue > gross) issues.push({ code: "FIXED_DISCOUNT_EXCEEDS_SUBTOTAL", rentalEquipmentLineId: groupKey, message: "Fixed discount exceeds the eligible subtotal for this equipment line and billing period." });
    const discount = group.discountType === "PERCENTAGE" ? roundMoney(gross * group.discountValue / 100) : group.discountType === "FIXED_AMOUNT" ? Math.min(gross, group.discountValue) : 0;
    let allocated = 0;
    members.forEach((line, index) => {
      const amount = index === members.length - 1 ? discount - allocated : gross ? roundMoney(discount * line.amount / gross) : 0;
      allocated += amount;
      const net = roundMoney(line.amount - amount);
      line.discountAmount = amount;
      line.subtotalAfterDiscount = net;
      line.vat = group.vatApplicable ? roundMoney(net * group.vatRate / 100) : undefined;
      line.withholdingTax = group.withholdingRate ? roundMoney(net * group.withholdingRate / 100) : undefined;
      line.grandTotal = roundMoney(net + (line.vat ?? 0) - (line.withholdingTax ?? 0));
    });
  }
  return { lines, issues, notices, subtotal: lines.reduce((sum, line) => sum + line.amount, 0), vat: lines.reduce((sum, line) => sum + (line.vat ?? 0), 0), withholdingTax: lines.reduce((sum, line) => sum + (line.withholdingTax ?? 0), 0), grandTotal: lines.reduce((sum, line) => sum + (line.grandTotal ?? line.amount), 0) };
}

type StatementPort = Pick<typeof billingStatementRepository, "getByRentalId" | "create" | "delete">;
type DeurPort = Pick<typeof deurRepository, "getById" | "update">;
export interface RentalLineBillingFailure {
  success: false;
  code: string;
  message: string;
  issues?: RentalLineBillingIssue[];
  diagnostic?: {
    stage: "authorization" | "statement-construction" | "statement-persistence" | "deur-consumption" | "compensation";
    cause: string;
    statementId?: string;
    rentalId: string;
    deurIds: string[];
  };
}

function safeCause(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unknown billing workflow failure.";
}

export function createRentalLineAwareBillingStatement(input: { aggregate: RentalAggregate; from: string; to: string; identity?: { id: string; statementNo: string }; equipment?: EquipmentRecord[]; operators?: Operator[]; authenticatedUser?: User | null }, dependencies: { statements?: StatementPort; deurs?: DeurPort } = {}): { success: true; statement: BillingStatement; deurs: DeurRecord[] } | RentalLineBillingFailure {
  const preview = buildRentalLineAwareBillingPreview(input);
  if (!preview.lines.length) return { success: false, code: "NO_BILLABLE_DEURS", message: "No eligible DEURs exist for the billing period.", issues: preview.issues };
  const statements = dependencies.statements ?? billingStatementRepository; const deurs = dependencies.deurs ?? deurRepository;
  const identity = input.identity ?? { id: crypto.randomUUID(), statementNo: `BS-${Date.now()}` };
  let creation: ReturnType<typeof createBillingStatementForRental>;
  try { creation = createBillingStatementForRental(input.aggregate, input.from, input.to, preview.lines, statements, { vat: preview.vat, withholdingTax: preview.withholdingTax, grandTotal: preview.grandTotal }, identity, input.authenticatedUser); }
  catch (error) {
    const authorization = error instanceof Error && error.name === "AuthorizationError";
    return {
      success: false,
      code: authorization ? "AUTHORIZATION_FAILED" : "STATEMENT_CREATION_FAILED",
      message: authorization
        ? "You do not have permission to create billing statements."
        : "Billing statement persistence failed before any DEUR was consumed.",
      diagnostic: {
        stage: authorization ? "authorization" : "statement-persistence",
        cause: safeCause(error),
        statementId: identity.id,
        rentalId: input.aggregate.rental.id,
        deurIds: preview.lines.map((line) => line.deurId),
      },
    };
  }
  if (!creation.success) return { success: false, code: "STATEMENT_CREATION_FAILED", message: creation.message };
  const originals: DeurRecord[] = []; const persisted: DeurRecord[] = [];
  try {
    for (const line of preview.lines) { const current = deurs.getById(line.deurId); if (!current || current.billingLocked || current.billingStatementId || current.billId || current.status === "Billed") throw new Error("A DEUR became unavailable during statement creation."); originals.push(current); const updated = deurs.update({ ...current, billingLocked: true, billingStatementId: creation.statement.id, updatedAt: new Date().toISOString() }); if (!updated) throw new Error("DEUR consumption could not be persisted."); persisted.push(updated); }
    return { success: true, statement: creation.statement, deurs: persisted };
  } catch (error) {
    let compensated = true;
    for (const original of originals) { try { if (!deurs.update(original)) compensated = false; } catch { compensated = false; } }
    try { if (!statements.delete(creation.statement.id)) compensated = false; } catch { compensated = false; }
    return {
      success: false,
      code: compensated ? "BATCH_CONSUMPTION_FAILED" : "COMPENSATION_FAILED",
      message: compensated ? safeCause(error) : "Billing consumption failed and local-storage compensation was incomplete; manual reconciliation is required.",
      diagnostic: {
        stage: compensated ? "deur-consumption" : "compensation",
        cause: safeCause(error),
        statementId: creation.statement.id,
        rentalId: input.aggregate.rental.id,
        deurIds: preview.lines.map((line) => line.deurId),
      },
    };
  }
}
