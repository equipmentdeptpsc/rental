import type { RentalAggregate } from "../aggregate";
import type { RentalDeurComplianceStatus } from "../deur/compliance/evaluateRentalDeurCompliance";

export function detectClosedRentalIntegrityViolation(aggregate: RentalAggregate, complianceStatus: RentalDeurComplianceStatus): string[] {
  if (aggregate.rental.status !== "Closed") return [];
  const violations: string[] = [];
  if (aggregate.rentalEquipmentLines.some((line) => !["Returned", "Closed", "Cancelled"].includes(line.status))) violations.push("equipment return is incomplete");
  if (complianceStatus !== "COMPLIANT") violations.push("DEUR compliance is incomplete");
  if (!aggregate.billing.hasStatement || !aggregate.billing.invoicePreparationComplete) violations.push("billing is incomplete");
  if (aggregate.billing.outstanding > 0 || !["Fully Collected", "No Amount Due"].includes(aggregate.billing.collectionStatus ?? "")) violations.push("collection is not settled");
  return violations;
}
