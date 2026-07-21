import type { BillingStatement, BillingStatementLine } from "@/features/rental/billingstatement/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";

export interface InvoiceDocumentWarning { code: "LEGACY_HEADER_ONLY" | "LINE_IDENTITY_INCOMPLETE" | "AMBIGUOUS_HISTORICAL_EQUIPMENT" | "SUBTOTAL_MISMATCH" | "VAT_MISMATCH" | "WITHHOLDING_MISMATCH" | "GRAND_TOTAL_MISMATCH"; message: string; lineId?: string }
export interface InvoiceDocumentLine extends BillingStatementLine { equipmentLabel: string; equipmentDescription?: string; operatorLabel: string; optionalCharges: Array<{ label: string; amount: number }> }
export interface InvoiceDocument { billingStatementId: string; statementNo: string; rentalId: string; customer: string; project: string; billingFrom: string; billingTo: string; statementDate: string; status: BillingStatement["invoiceStatus"]; currency: string; lines: InvoiceDocumentLine[]; subtotal: number; vat: number; withholdingTax: number; grandTotal: number; amountCollected?: number; outstandingBalance?: number; warnings: InvoiceDocumentWarning[] }

const sum = (lines: BillingStatementLine[], field: "amount" | "vat" | "withholdingTax" | "grandTotal") => lines.reduce((total, line) => total + (line[field] ?? (field === "grandTotal" ? line.amount : 0)), 0);

/** Builds a read-only accounting document exclusively from persisted statement values. */
export function buildInvoiceDocument(statement: BillingStatement, equipment: EquipmentRecord[] = [], operators: Operator[] = [], currency = "PHP", collection?: { amountCollected: number; outstandingBalance: number }): InvoiceDocument {
  const warnings: InvoiceDocumentWarning[] = [];
  if (!Array.isArray(statement.lines) || statement.lines.length === 0) warnings.push({ code: "LEGACY_HEADER_ONLY", message: "This historical document has header totals only; detailed rows were not fabricated." });
  const distinctLineEquipment = new Set((statement.lines ?? []).map((line) => line.equipmentId).filter(Boolean));
  const lines = (statement.lines ?? []).map((line) => {
    if (!line.rentalEquipmentLineId || !line.equipmentId || !line.deurId) warnings.push({ code: "LINE_IDENTITY_INCOMPLETE", lineId: line.id ?? line.deurId, message: "Historical statement line does not contain complete Rental Equipment Line identity." });
    const equipmentId = line.equipmentId || (distinctLineEquipment.size === 0 ? statement.equipmentId : "");
    if (!equipmentId && distinctLineEquipment.size > 1) warnings.push({ code: "AMBIGUOUS_HISTORICAL_EQUIPMENT", lineId: line.id ?? line.deurId, message: "Historical equipment identity is ambiguous and was not inferred." });
    const machine = equipment.find((item) => item.id === equipmentId); const operator = operators.find((item) => item.id === line.operatorId);
    const optionalCharges = [["Idle / standby", line.idleCharge], ["Mobilization", line.mobilizationCharge], ["Demobilization", line.demobilizationCharge], ["Operator", line.operatorCharge], ["Fuel", line.fuelCharge]].filter((item): item is [string, number] => typeof item[1] === "number" && item[1] > 0).map(([label, amount]) => ({ label, amount }));
    return { ...structuredClone(line), equipmentLabel: machine?.assetNo ?? (equipmentId || "Equipment unavailable"), equipmentDescription: machine?.equipmentName, operatorLabel: operator?.name ?? line.operatorId ?? statement.operatorId ?? "—", optionalCharges };
  });
  const checks = [{ code: "SUBTOTAL_MISMATCH" as const, actual: sum(statement.lines ?? [], "amount"), expected: statement.subtotal, label: "subtotal" }, { code: "VAT_MISMATCH" as const, actual: sum(statement.lines ?? [], "vat"), expected: statement.vat ?? 0, label: "VAT" }, { code: "WITHHOLDING_MISMATCH" as const, actual: sum(statement.lines ?? [], "withholdingTax"), expected: statement.withholdingTax ?? 0, label: "withholding tax" }, { code: "GRAND_TOTAL_MISMATCH" as const, actual: sum(statement.lines ?? [], "grandTotal"), expected: statement.grandTotal ?? statement.subtotal, label: "grand total" }];
  for (const check of checks) if (check.actual !== check.expected) warnings.push({ code: check.code, message: `Persisted line ${check.label} (${check.actual}) does not reconcile to the statement ${check.label} (${check.expected}).` });
  return { billingStatementId: statement.id, statementNo: statement.statementNo, rentalId: statement.rentalId, customer: statement.customer, project: statement.project, billingFrom: statement.billingFrom, billingTo: statement.billingTo, statementDate: statement.createdAt, status: statement.invoiceStatus, currency, lines, subtotal: statement.subtotal, vat: statement.vat ?? 0, withholdingTax: statement.withholdingTax ?? 0, grandTotal: statement.grandTotal ?? statement.subtotal, amountCollected: collection?.amountCollected, outstandingBalance: collection?.outstandingBalance, warnings };
}
