import type { BillingFinancialCommandRepository, BillingEvidenceProjection } from "@/features/rental/operations/commands/contracts";
import type { BillingPreviewLine } from "./types";

export interface CanonicalBillingIdentity {
  statementId: string;
  create: { commandId: string; idempotencyKey: string };
  evidence: Record<string, { commandId: string; idempotencyKey: string }>;
  consumption: Record<string, { commandId: string; idempotencyKey: string; lineId: string }>;
}

export type CanonicalBillingCreationResult =
  | { success: true; statementId: string }
  | { success: false; message: string };

function sameMoney(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function evidenceMismatches(evidence: BillingEvidenceProjection, preview: BillingPreviewLine): string[] {
  const mismatches: string[] = [];
  const previewUnitRate = preview.unitRate ?? preview.hourlyRate;
  if (evidence.deurId !== preview.deurId) mismatches.push("DEUR identity");
  if (evidence.billingMethod !== preview.billingMethod) mismatches.push(`billing method (${evidence.billingMethod} / ${preview.billingMethod})`);
  if (!sameMoney(evidence.unitRate, previewUnitRate)) mismatches.push(`unit rate (${evidence.unitRate} / ${previewUnitRate})`);
  if (!sameMoney(evidence.subtotal, preview.amount)) mismatches.push(`subtotal (${evidence.subtotal} / ${preview.amount})`);
  if (!sameMoney(evidence.vat, preview.vat ?? 0)) mismatches.push(`VAT (${evidence.vat} / ${preview.vat ?? 0})`);
  if (!sameMoney(evidence.withholdingTax, preview.withholdingTax ?? 0)) mismatches.push(`withholding (${evidence.withholdingTax} / ${preview.withholdingTax ?? 0})`);
  if (!sameMoney(evidence.grandTotal, preview.grandTotal ?? preview.amount)) mismatches.push(`grand total (${evidence.grandTotal} / ${preview.grandTotal ?? preview.amount})`);
  return mismatches;
}

export async function createCanonicalBillingStatement(input: {
  rentalId: string;
  from: string;
  to: string;
  currency: string;
  preview: readonly BillingPreviewLine[];
  identity: CanonicalBillingIdentity;
  repository: BillingFinancialCommandRepository;
}): Promise<CanonicalBillingCreationResult> {
  for (const line of input.preview) {
    const result = await input.repository.generateEvidence({ ...input.identity.evidence[line.deurId], deurId: line.deurId });
    if (!result.success) return { success: false, message: result.message };
    const mismatches = evidenceMismatches(result.value, line);
    if (mismatches.length) {
      return { success: false, message: `Canonical billing evidence changed: ${mismatches.join(", ")}. Refresh and review before creating a statement.` };
    }
  }

  const created = await input.repository.createStatement({
    ...input.identity.create,
    statementId: input.identity.statementId,
    rentalId: input.rentalId,
    billingFrom: input.from,
    billingTo: input.to,
    currency: input.currency,
  });
  if (!created.success) return { success: false, message: created.message };

  for (const line of input.preview) {
    const command = input.identity.consumption[line.deurId];
    const consumed = await input.repository.consumeDeur({
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      lineId: command.lineId,
      statementId: input.identity.statementId,
      deurId: line.deurId,
      description: line.description,
    });
    if (!consumed.success) return { success: false, message: consumed.message };
  }
  return { success: true, statementId: input.identity.statementId };
}
