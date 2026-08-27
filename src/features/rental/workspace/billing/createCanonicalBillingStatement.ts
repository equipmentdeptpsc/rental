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

function evidenceMatchesPreview(evidence: BillingEvidenceProjection, preview: BillingPreviewLine): boolean {
  return evidence.deurId === preview.deurId
    && evidence.billingMethod === preview.billingMethod
    && sameMoney(evidence.unitRate, preview.unitRate ?? 0)
    && sameMoney(evidence.subtotal, preview.amount)
    && sameMoney(evidence.vat, preview.vat ?? 0)
    && sameMoney(evidence.withholdingTax, preview.withholdingTax ?? 0)
    && sameMoney(evidence.grandTotal, preview.grandTotal ?? preview.amount);
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
    if (!evidenceMatchesPreview(result.value, line)) {
      return { success: false, message: "Canonical billing evidence changed. Refresh and review the billing preview before creating a statement." };
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
