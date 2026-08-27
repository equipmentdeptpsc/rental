import type { BillingStatement, BillingStatementLine } from "@/features/rental/billingstatement/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";

export interface InvoiceDocumentWarning { code: "LEGACY_HEADER_ONLY" | "LINE_IDENTITY_INCOMPLETE" | "AMBIGUOUS_HISTORICAL_EQUIPMENT" | "SUBTOTAL_MISMATCH" | "VAT_MISMATCH" | "WITHHOLDING_MISMATCH" | "GRAND_TOTAL_MISMATCH"; message: string; lineId?: string }
export interface InvoiceDocumentLine extends BillingStatementLine { equipmentLabel: string; equipmentDescription?: string; operatorLabel: string }
export interface InvoiceServiceLine { key: string; deurReference: string; workDate: string; equipmentLabel: string; operatorLabel: string; service: string; quantityLabel: string; rate?: number; amount: number }
export interface InvoiceDocument { billingStatementId: string; statementVersion: number; statementNo: string; rentalId: string; rentalNumber: string; customer: string; customerRepresentativeName?: string; customerRepresentativeEmail?: string; project: string; billingFrom: string; billingTo: string; statementDate: string; status: BillingStatement["invoiceStatus"]; currency: string; lines: InvoiceDocumentLine[]; serviceLines: InvoiceServiceLine[]; subtotal: number; vatApplicable: boolean; vat?: number; withholdingTaxApplicable: boolean; withholdingTax?: number; grandTotal: number; amountCollected?: number; outstandingBalance?: number; warnings: InvoiceDocumentWarning[] }

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
    const frozenEquipment = line.equipmentSnapshot;
    const frozenEquipmentLabel = frozenEquipment?.name && frozenEquipment.assetNo ? `${frozenEquipment.name} (${frozenEquipment.assetNo})` : frozenEquipment?.name ?? frozenEquipment?.assetNo;
    return { ...structuredClone(line), equipmentLabel: line.equipmentLabel ?? frozenEquipmentLabel ?? (machine ? `${machine.equipmentName} (${machine.assetNo})` : "Equipment record unavailable"), equipmentDescription: frozenEquipment?.name ?? machine?.equipmentName, operatorLabel: line.operatorLabel ?? line.operatorSnapshot?.name ?? operator?.name ?? "Operator not assigned", deurReference: line.deurReference ?? "DEUR reference unavailable" };
  });
  const checks = [{ code: "SUBTOTAL_MISMATCH" as const, actual: sum(statement.lines ?? [], "amount"), expected: statement.subtotal, label: "subtotal" }, { code: "VAT_MISMATCH" as const, actual: sum(statement.lines ?? [], "vat"), expected: statement.vat ?? 0, label: "VAT" }, { code: "WITHHOLDING_MISMATCH" as const, actual: sum(statement.lines ?? [], "withholdingTax"), expected: statement.withholdingTax ?? 0, label: "withholding tax" }, { code: "GRAND_TOTAL_MISMATCH" as const, actual: sum(statement.lines ?? [], "grandTotal"), expected: statement.grandTotal ?? statement.subtotal, label: "grand total" }];
  for (const check of checks) if (check.actual !== check.expected) warnings.push({ code: check.code, message: `Persisted line ${check.label} (${check.actual}) does not reconcile to the statement ${check.label} (${check.expected}).` });
  const vatApplicable = statement.vatApplicable ?? statement.vat !== undefined;
  const withholdingTaxApplicable = statement.withholdingTaxApplicable ?? statement.withholdingTax !== undefined;
  const serviceLines = lines.flatMap((line): InvoiceServiceLine[] => {
    const base = { deurReference: line.deurReference ?? "DEUR reference unavailable", workDate: line.workDate, equipmentLabel: line.equipmentLabel, operatorLabel: line.operatorLabel };
    const result: InvoiceServiceLine[] = [];
    if ((line.operatingCharge ?? line.amount) > 0) {
      const quantityLabel = line.quantity !== undefined ? `${line.quantity.toFixed(2)} ${line.unit ?? ""}`.trim()
        : line.billingMethod === "Per Hour" ? `${line.hours.toFixed(2)} hr`
        : `1 ${line.billingMethod?.replace("Per ", "").toLowerCase() ?? "service"}`;
      result.push({ ...base, key: `${line.id ?? line.deurId}-operating`, service: line.description, quantityLabel, rate: line.unitRate ?? line.hourlyRate, amount: line.operatingCharge ?? line.amount });
    }
    const hourly = [["Idle Hours", line.idleCharge, line.idleHours], ["Standby Hours", line.standbyCharge, line.standbyHours]] as const;
    for (const [service, amount, hours] of hourly) if ((amount ?? 0) > 0) result.push({ ...base, key: `${line.id ?? line.deurId}-${service}`, service, quantityLabel: `${(hours ?? 0).toFixed(2)} hr`, ...(hours ? { rate: amount! / hours } : {}), amount: amount! });
    const fixed = [["Mobilization", line.mobilizationCharge], ["Demobilization", line.demobilizationCharge], ["Operator Charge", line.operatorCharge], ["Fuel Charge", line.fuelCharge]] as const;
    for (const [service, amount] of fixed) if ((amount ?? 0) > 0) result.push({ ...base, key: `${line.id ?? line.deurId}-${service}`, service, quantityLabel: "1 service", amount: amount! });
    return result;
  });
  return { billingStatementId: statement.id, statementVersion: statement.version, statementNo: statement.statementNo, rentalId: statement.rentalId, rentalNumber: statement.rentalNumber ?? lines.find((line) => line.rentalNumberSnapshot)?.rentalNumberSnapshot ?? "Rental number unavailable", customer: statement.customer, customerRepresentativeName: statement.customerRepresentativeName, customerRepresentativeEmail: statement.customerRepresentativeEmail, project: statement.project, billingFrom: statement.billingFrom, billingTo: statement.billingTo, statementDate: statement.createdAt, status: statement.invoiceStatus, currency, lines, serviceLines, subtotal: statement.subtotal, vatApplicable, ...(vatApplicable && statement.vat !== undefined ? { vat: statement.vat } : {}), withholdingTaxApplicable, ...(withholdingTaxApplicable && statement.withholdingTax !== undefined ? { withholdingTax: statement.withholdingTax } : {}), grandTotal: statement.grandTotal ?? statement.subtotal, amountCollected: collection?.amountCollected, outstandingBalance: collection?.outstandingBalance, warnings };
}
