import type { RentalAggregate } from "@/features/rental/aggregate";
import type { BillingInvoiceStatus, BillingStatement } from "../types";
import { billingStatementRepository } from "../repository";
import { createBillingStatement } from "@/features/rental/workspace/billing/createBillingStatement";
import type { BillingPreviewLine } from "@/features/rental/workspace/billing/types";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { evaluateDeurBillingEligibility, type DeurBillingEligibilityResult } from "@/features/rental/deur/billing/evaluateDeurBillingEligibility";
import type { DeurRecord } from "@/features/rental/deur/types";
import { calculateDeurBillingStatementLine } from "./calculateDeurBillingStatementLine";
import { mapRentalContractToBillingCalculationTerms, resolveDeurBillingCalculationTerms, type BillingChargeResult } from "@/features/rental/billing/engine";

type Result =
  | { success: true; statement: BillingStatement }
  | { success: false; message: string };

type BillingStatementRepositoryPort = Pick<
  typeof billingStatementRepository,
  "getById" | "getByRentalId" | "create" | "delete"
>;

type DeurRepositoryPort = Pick<typeof deurRepository, "getById" | "update"> & { getByRentalId?: typeof deurRepository.getByRentalId };

export interface SingleDeurBillingStatementInput {
  aggregate: RentalAggregate;
  billingFrom: string;
  billingTo: string;
}

export interface ConsumeDeurIntoBillingStatementCommand {
  deurId: string;
  expectedDeurUpdatedAt?: string;
  statementInput: SingleDeurBillingStatementInput;
  statementIdentity?: { id: string; statementNo: string };
}

export type ConsumeDeurIntoBillingStatementResult =
  | { success: true; code: "SUCCESS"; statement: BillingStatement; deur: DeurRecord; idempotent: boolean }
  | {
    success: false;
    code: "DEUR_NOT_FOUND" | "INVALID_COMMAND" | "STALE_DEUR" | "ELIGIBILITY_REJECTED" | "DUPLICATE_CONSUMPTION" | "CALCULATION_FAILED" | "STATEMENT_CREATION_FAILED" | "DEUR_UPDATE_FAILED" | "COMPENSATION_FAILED";
    message: string;
    eligibility?: DeurBillingEligibilityResult;
    statementId?: string;
  };

export interface BillingStatementWorkflowDependencies {
  statements?: BillingStatementRepositoryPort;
  deurs?: DeurRepositoryPort;
}

export function createBillingStatementForRental(
  aggregate: RentalAggregate,
  from: string,
  to: string,
  lines: BillingPreviewLine[],
  statements: Pick<BillingStatementRepositoryPort, "getByRentalId" | "create"> = billingStatementRepository,
  financials?: Pick<BillingChargeResult, "vat" | "withholdingTax" | "grandTotal">,
  identity?: { id: string; statementNo: string },
): Result {
  if (["Cancelled", "Closed"].includes(aggregate.rental.status)) {
    return { success: false, message: "Cancelled or closed rentals cannot create billing statements." };
  }

  const lineAware = lines.every((line) => Boolean(line.rentalEquipmentLineId && line.equipmentId && line.deurId));
  if (!aggregate.rental.id || (!lineAware && (!aggregate.equipment?.id || !aggregate.operator?.id || !aggregate.contract))) {
    return { success: false, message: "Rental and equipment-aware billing evidence are required." };
  }

  if (!from || !to || from > to) {
    return { success: false, message: "Enter a valid billing period." };
  }

  if (lines.length === 0) {
    return { success: false, message: "Generate at least one billable DEUR line before creating a statement." };
  }

  const duplicate = statements.getByRentalId(aggregate.rental.id).some(
    (statement) =>
      statement.billingFrom === from &&
      statement.billingTo === to &&
      statement.invoiceStatus !== "Cancelled"
  );

  if (duplicate) {
    return { success: false, message: "A billing statement already exists for this rental and period." };
  }

  const statement = createBillingStatement(aggregate, from, to, lines, financials, identity);
  statements.create(statement);
  return { success: true, statement };
}

function failure(
  code: Extract<ConsumeDeurIntoBillingStatementResult, { success: false }>['code'],
  message: string,
  extras: Pick<Extract<ConsumeDeurIntoBillingStatementResult, { success: false }>, "eligibility" | "statementId"> = {},
): ConsumeDeurIntoBillingStatementResult {
  return { success: false, code, message, ...extras };
}

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function revisionChainFor(deur: DeurRecord, deurs: DeurRepositoryPort) {
  const chainId = deur.revision?.chainId ?? deur.id;
  return (deurs.getByRentalId?.(deur.rentalId) ?? [deur]).filter(
    (item) => (item.revision?.chainId ?? item.id) === chainId,
  );
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findIdempotentStatement(
  deur: DeurRecord,
  statements: BillingStatementRepositoryPort,
): BillingStatement | undefined {
  const statementId = deur.billingStatementId?.trim();
  if (!deur.billingLocked || !statementId || hasText(deur.billId) || deur.status === "Billed") {
    return undefined;
  }

  const statement = statements.getById(statementId);
  return statement?.rentalId === deur.rentalId && statement.lines.some((line) => line.deurId === deur.id)
    ? statement
    : undefined;
}

/**
 * Consumes exactly one eligible DEUR into the existing canonical statement
 * workflow. LocalStorage cannot make its two writes transactional, so a failed
 * DEUR update attempts to compensate by deleting the just-created statement.
 */
export function consumeDeurIntoBillingStatement(
  command: ConsumeDeurIntoBillingStatementCommand,
  dependencies: BillingStatementWorkflowDependencies = {},
): ConsumeDeurIntoBillingStatementResult {
  const statements = dependencies.statements ?? billingStatementRepository;
  const deurs = dependencies.deurs ?? deurRepository;

  if (!isObject(command) || !isNonBlankString(command.deurId) || !isObject(command.statementInput)) {
    return failure("INVALID_COMMAND", "A DEUR and billing statement input are required.");
  }

  const deur = deurs.getById(command.deurId);
  if (!deur) {
    return failure("DEUR_NOT_FOUND", "DEUR not found.");
  }

  if (command.expectedDeurUpdatedAt !== undefined && command.expectedDeurUpdatedAt !== deur.updatedAt) {
    return failure("STALE_DEUR", "The DEUR changed before it could be consumed.");
  }

  const idempotentStatement = findIdempotentStatement(deur, statements);
  if (idempotentStatement) {
    return { success: true, code: "SUCCESS", statement: idempotentStatement, deur, idempotent: true };
  }

  if (deur.billingLocked || hasText(deur.billingStatementId) || hasText(deur.billId) || deur.status === "Billed") {
    return failure("DUPLICATE_CONSUMPTION", "The DEUR is already associated with billing.");
  }

  const { aggregate, billingFrom, billingTo } = command.statementInput;
  if (
    !isObject(aggregate)
    || !isNonBlankString(aggregate.rental?.id)
    || !isNonBlankString(aggregate.contract?.billingMethod)
    || !isNonBlankString(billingFrom)
    || !isNonBlankString(billingTo)
    || aggregate.rental.id !== deur.rentalId
  ) {
    return failure("INVALID_COMMAND", "Billing statement input does not match the DEUR rental.");
  }

  const resolvedCommercial=resolveDeurBillingCalculationTerms(deur,mapRentalContractToBillingCalculationTerms(aggregate.contract));
  const eligibility = evaluateDeurBillingEligibility({
    deur,
    billingMethod: resolvedCommercial.terms.billingMethod,
    unitRate: resolvedCommercial.terms.unitRate,
    revisionChain: revisionChainFor(deur, deurs),
  });
  if (!eligibility.eligible) {
    return failure("ELIGIBILITY_REJECTED", eligibility.reason, { eligibility });
  }

  const calculatedLine = calculateDeurBillingStatementLine(
    deur,
    resolvedCommercial.terms,
  );
  if (!calculatedLine.success) {
    return failure("CALCULATION_FAILED", calculatedLine.message);
  }

  let statement: BillingStatement;
  try {
    const creation = createBillingStatementForRental(
      aggregate, billingFrom, billingTo, [calculatedLine.line], statements,
      calculatedLine.charges, command.statementIdentity,
    );
    if (!creation.success) {
      return failure("STATEMENT_CREATION_FAILED", creation.message);
    }
    statement = creation.statement;
  } catch {
    return failure("STATEMENT_CREATION_FAILED", "Billing statement persistence failed.");
  }

  const nextDeur: DeurRecord = {
    ...deur,
    billingLocked: true,
    billingStatementId: statement.id,
    updatedAt: new Date().toISOString(),
  };

  try {
    const persistedDeur = deurs.update(nextDeur);
    if (!persistedDeur) throw new Error("DEUR update failed.");
    return { success: true, code: "SUCCESS", statement, deur: persistedDeur, idempotent: false };
  } catch {
    try {
      if (!statements.delete(statement.id)) throw new Error("Statement compensation failed.");
      return failure("DEUR_UPDATE_FAILED", "DEUR consumption could not be persisted; the billing statement was removed.", { statementId: statement.id });
    } catch {
      return failure("COMPENSATION_FAILED", "DEUR consumption failed and billing statement compensation also failed.", { statementId: statement.id });
    }
  }
}

const invoiceTransitions: Record<BillingInvoiceStatus, BillingInvoiceStatus[]> = {
  "Not Invoiced": ["Invoiced"],
  "Invoiced": ["Partially Collected", "Fully Collected"],
  "Partially Collected": ["Fully Collected"],
  "Fully Collected": [],
  "Cancelled": [],
};

export function updateBillingInvoiceStatus(
  statementId: string,
  nextStatus: BillingInvoiceStatus
): Result {
  const statement = billingStatementRepository.getById(statementId);

  if (!statement) {
    return { success: false, message: "Billing statement not found." };
  }

  if (!invoiceTransitions[statement.invoiceStatus].includes(nextStatus)) {
    return { success: false, message: `Cannot change invoice status from ${statement.invoiceStatus} to ${nextStatus}.` };
  }

  const updated = { ...statement, invoiceStatus: nextStatus };
  billingStatementRepository.update(updated);
  return { success: true, statement: updated };
}
