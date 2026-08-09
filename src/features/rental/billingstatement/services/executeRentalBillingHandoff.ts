import type { RentalAggregate } from "@/features/rental/aggregate";
import type { BillingChargeResult } from "@/features/rental/billing/engine";
import { mapRentalContractToBillingCalculationTerms } from "@/features/rental/billing/engine";
import { createDeurBillingPreview, type DeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { billingStatementRepository } from "../repository";
import type { BillingStatement } from "../types";
import { consumeDeurIntoBillingStatement, type BillingStatementWorkflowDependencies } from "./BillingStatementWorkflow";
import type { User } from "@/features/auth/domain/user";
import { assertMutationPermission } from "@/features/auth/services/assertMutationPermission";

export interface BillingHandoffIssue { code: string; message: string }
export interface BillingHandoffReview {
  rentalId: string; rentalReference: string; deurId: string; deurReference: string;
  billingMethod: RentalAggregate["contract"] extends infer T ? T extends { billingMethod: infer M } ? M : never : never;
  calculatedAt: string; previewStatus: "available"; charges: BillingChargeResult;
  commercialTermsSource?: DeurBillingPreview["commercialTermsSource"];
  commercialCapturedAt?: string;
  eligibilityReasonCodes: string[]; sourceUpdatedAt?: string; contractUpdatedAt?: string;
}
export type PrepareBillingHandoffResult =
  | { status: "ready"; review: BillingHandoffReview; preview: DeurBillingPreview }
  | { status: "blocked"; issues: BillingHandoffIssue[]; preview?: DeurBillingPreview };
export type BillingHandoffResult =
  | { status: "created"; statementId: string; statementNumber: string; rentalId: string; deurId: string; charges: BillingChargeResult }
  | { status: "review-stale"; issues: BillingHandoffIssue[]; latestPreview: DeurBillingPreview; latestReview: BillingHandoffReview }
  | { status: "ineligible"; issues: BillingHandoffIssue[] }
  | { status: "already-created"; statementId: string; statementNumber: string }
  | { status: "failed"; issues: BillingHandoffIssue[] };

type StatementPort = Pick<typeof billingStatementRepository, "getById" | "getByRentalId" | "create" | "delete">;
type DeurPort = Pick<typeof deurRepository, "getById" | "update"> & { getByRentalId?: typeof deurRepository.getByRentalId };
export type BillingHandoffCheckpoint = "before-statement" | "after-consumption" | "before-audit";
export interface BillingHandoffDependencies {
  statements?: StatementPort; deurs?: DeurPort;
  /** @deprecated Billing creation never closes the Rental. Closure is a separate guarded command. */
  closeRental?(rentalId: string): { success: boolean; message?: string };
  audit?(event: { type: string; rentalId: string; deurId: string; statementId?: string }): void;
  checkpoint?(point: BillingHandoffCheckpoint): void;
}

function issue(code: string, message: string): BillingHandoffIssue { return { code, message }; }
function previewFor(aggregate: RentalAggregate, deur: DeurRecord, evaluatedAt?: string | Date) {
  if (!aggregate.contract) return undefined;
  const chainId = deur.revision?.chainId ?? deur.id;
  const revisionChain = aggregate.deurs.filter((item) => (item.revision?.chainId ?? item.id) === chainId);
  return createDeurBillingPreview({ deur, terms: mapRentalContractToBillingCalculationTerms(aggregate.contract), evaluatedAt, revisionChain });
}
function reviewFrom(aggregate: RentalAggregate, deur: DeurRecord, preview: DeurBillingPreview): BillingHandoffReview {
  return {
    rentalId: aggregate.rental.id, rentalReference: aggregate.rental.rentalNumber ?? aggregate.rental.id,
    deurId: deur.id, deurReference: deur.deurNumber?.trim() || deur.id, billingMethod: preview.billingMethod,
    calculatedAt: preview.calculatedAt, previewStatus: "available", charges: structuredClone(preview.charges!),
    commercialTermsSource:preview.commercialTermsSource,commercialCapturedAt:preview.commercialCapturedAt,
    eligibilityReasonCodes: [...preview.eligibility.reasonCodes], sourceUpdatedAt: deur.updatedAt, contractUpdatedAt: aggregate.contract!.updatedAt,
  };
}

export function prepareRentalBillingHandoff(input: { aggregate: RentalAggregate; evaluatedAt?: string | Date }): PrepareBillingHandoffResult {
  const { aggregate } = input;
  if (aggregate.rental.status !== "Returned") return { status: "blocked", issues: [issue("RENTAL_NOT_RETURNED", "The rental must be returned before billing handoff.")] };
  if (aggregate.assignment?.status === "Active") return { status: "blocked", issues: [issue("ASSIGNMENT_ACTIVE", "Complete the equipment assignment before closing the rental.")] };
  if (!aggregate.contract) return { status: "blocked", issues: [issue("BILLING_CONFIGURATION_REQUIRED", "A billing contract is required.")] };
  const candidates = aggregate.deurs.map((deur) => ({ deur, preview: previewFor(aggregate, deur, input.evaluatedAt)! }));
  const available = candidates.filter((item) => item.preview.status === "available");
  if (available.length > 1) return { status: "blocked", issues: [issue("MULTIPLE_ELIGIBLE_DEURS", "Select one eligible DEUR before creating billing.")] };
  if (available.length === 0) {
    const selected = candidates.at(-1);
    const firstIssue = selected?.preview.issues[0];
    const reason = selected?.preview.eligibility.reasonCodes[0];
    return { status: "blocked", issues: [issue(firstIssue?.code ?? (reason === "UNSUPPORTED_BILLING_EVIDENCE" ? "QUANTITY_REQUIRED" : reason ?? "PREVIEW_NOT_AVAILABLE"), firstIssue?.message ?? "A final available billing preview is required.")], preview: selected?.preview };
  }
  const { deur, preview } = available[0];
  const review = reviewFrom(aggregate, deur, preview);
  return { status: "ready", review: structuredClone(review), preview: structuredClone(preview) };
}

function sameCharges(left: BillingChargeResult, right: BillingChargeResult): boolean {
  return (Object.keys(left) as Array<keyof BillingChargeResult>).every((key) => Object.is(left[key], right[key]));
}
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).toUpperCase();
}
function identity(rentalId: string, deurId: string) {
  const key = `${rentalId}:${deurId}`;
  return { id: `billing-handoff-${key}`, statementNo: `BS-${stableHash(key)}` };
}
function billingIdentityDeurId(deur: DeurRecord) { return deur.revision?.chainId ?? deur.id; }
function matchingStatement(deur: DeurRecord, statements: StatementPort): BillingStatement | undefined {
  const id = deur.billingStatementId?.trim(); if (!id) return undefined;
  const statement = statements.getById(id);
  return statement?.rentalId === deur.rentalId && statement.lines.some((line) => line.deurId === deur.id) ? statement : undefined;
}

export function executeRentalBillingHandoff(input: { aggregate: RentalAggregate; review: BillingHandoffReview; authenticatedUser?: User | null }, dependencies: BillingHandoffDependencies): BillingHandoffResult {
  assertMutationPermission(input.authenticatedUser, "billing.create");
  const statements = dependencies.statements ?? billingStatementRepository; const deurs = dependencies.deurs ?? deurRepository;
  try {
    const latest = deurs.getById(input.review.deurId);
    if (!latest) return { status: "ineligible", issues: [issue("DEUR_NOT_FOUND", "The selected DEUR no longer exists.")] };
    const existing = matchingStatement(latest, statements);
    if (existing) {
      dependencies.audit?.({ type: "duplicate-resolved", rentalId: input.review.rentalId, deurId: latest.id, statementId: existing.id });
      return { status: "already-created", statementId: existing.id, statementNumber: existing.statementNo };
    }
    const expectedIdentity = identity(input.review.rentalId, billingIdentityDeurId(latest));
    const partial = statements.getById(expectedIdentity.id);
    if (
      partial && partial.rentalId === latest.rentalId && partial.lines.some((line) => line.deurId === latest.id)
      && Object.is(partial.subtotal, input.review.charges.subtotal)
      && Object.is(partial.vat ?? 0, input.review.charges.vat)
      && Object.is(partial.withholdingTax ?? 0, input.review.charges.withholdingTax)
      && Object.is(partial.grandTotal ?? partial.subtotal, input.review.charges.grandTotal)
    ) {
      const repaired = deurs.update({ ...latest, billingLocked: true, billingStatementId: partial.id, updatedAt: new Date().toISOString() });
      if (!repaired) return { status: "failed", issues: [issue("PARTIAL_REPAIR_FAILED", "The existing billing statement could not be linked to its DEUR.")] };
      dependencies.audit?.({ type: "partial-recovered", rentalId: input.review.rentalId, deurId: latest.id, statementId: partial.id });
      return { status: "already-created", statementId: partial.id, statementNumber: partial.statementNo };
    }
    if (latest.billingLocked || latest.billingStatementId || latest.billId || latest.status === "Billed") return { status: "ineligible", issues: [issue("ALREADY_BILLED", "The selected DEUR is already associated with billing.")] };
    const latestPreview = previewFor(input.aggregate, latest);
    if (!latestPreview || latestPreview.status !== "available" || !latestPreview.charges) return { status: "ineligible", issues: [issue("PREVIEW_NOT_AVAILABLE", "The selected DEUR no longer has a final billing preview.")] };
    if (
      input.review.rentalId !== input.aggregate.rental.id || input.review.deurId !== latest.id
      || input.review.billingMethod !== latestPreview.billingMethod
      || input.review.sourceUpdatedAt !== latest.updatedAt
      || (input.review.commercialTermsSource !== "IMMUTABLE_SNAPSHOT" && input.review.contractUpdatedAt !== input.aggregate.contract?.updatedAt)
      || !sameCharges(input.review.charges, latestPreview.charges)
    ) return { status: "review-stale", issues: [issue("REVIEW_STALE", "Billing evidence or rates changed. Review the refreshed preview again.")], latestPreview, latestReview: reviewFrom(input.aggregate, latest, latestPreview) };
    dependencies.checkpoint?.("before-statement");
    const workflowDependencies: BillingStatementWorkflowDependencies = { statements, deurs };
    const consumed = consumeDeurIntoBillingStatement({
      deurId: latest.id, expectedDeurUpdatedAt: latest.updatedAt,
      statementInput: { aggregate: input.aggregate, billingFrom: latest.reportDate ?? latest.workDate, billingTo: latest.reportDate ?? latest.workDate },
      statementIdentity: expectedIdentity,
      authenticatedUser: input.authenticatedUser,
    }, workflowDependencies);
    if (!consumed.success) return { status: "failed", issues: [issue(consumed.code, consumed.message)] };
    dependencies.checkpoint?.("after-consumption");
    dependencies.checkpoint?.("before-audit");
    dependencies.audit?.({ type: consumed.idempotent ? "duplicate-resolved" : "handoff-completed", rentalId: input.review.rentalId, deurId: latest.id, statementId: consumed.statement.id });
    return consumed.idempotent
      ? { status: "already-created", statementId: consumed.statement.id, statementNumber: consumed.statement.statementNo }
      : { status: "created", statementId: consumed.statement.id, statementNumber: consumed.statement.statementNo, rentalId: input.review.rentalId, deurId: latest.id, charges: structuredClone(latestPreview.charges) };
  } catch {
    return { status: "failed", issues: [issue("HANDOFF_FAILED", "The billing handoff could not be completed safely.")] };
  }
}
