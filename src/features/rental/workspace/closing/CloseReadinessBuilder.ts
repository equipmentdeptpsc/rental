import type {
    RentalAggregate,
  } from "@/features/rental/aggregate";
  
import type {
    CloseReadiness,
  } from "./types";
import { aggregateRentalEquipmentLineDeurCompliance, evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import { projectRentalCollectionStatus } from "@/features/rental/collections/collectionStatusProjection";
  
  export function buildCloseReadiness(
    aggregate: RentalAggregate,
    evaluationTimestamp = new Date().toISOString(),
  ): CloseReadiness {
    const reasons: string[] = [];
    const checks: CloseReadiness["checks"] = [];
  
    const hasOpenAssignment =
      aggregate.assignment?.status ===
      "Active";
  
    if (hasOpenAssignment) {
      reasons.push(
        "Equipment assignment is still active."
      );
    }
  
    const unreturnedLines = aggregate.rentalEquipmentLines.filter((line) =>
      !["Returned", "Closed", "Cancelled"].includes(line.status),
    );
    checks.push({ code: "ALL_EQUIPMENT_RETURNED", satisfied: unreturnedLines.length === 0, message: unreturnedLines.length ? `${unreturnedLines.length} equipment line(s) are not returned.` : "All equipment lines are returned." });
    if (unreturnedLines.length) reasons.push(`${unreturnedLines.length} equipment line(s) are not returned.`);

    const lineCompliance = evaluateRentalEquipmentLineDeurCompliance({ rental: aggregate.rental, lines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, evaluationTimestamp });
    const compliance = aggregateRentalEquipmentLineDeurCompliance(aggregate.rental.id, lineCompliance);
    const hasPendingOperations = compliance.status !== "COMPLIANT";
  
    if (hasPendingOperations) {
      const firstIncomplete = compliance.expectations.find((item) => !["COMPLIANT", "CURRENT", "NOT_YET_DUE"].includes(item.status));
      const legacyIncomplete = aggregate.deurs.find((deur) => ["Submitted", "Pending Acknowledgement"].includes(deur.status));
      const reference = firstIncomplete?.matchingDeurNumber
        ? `${firstIncomplete.matchingDeurNumber}${firstIncomplete.matchingRevisionNumber ? ` R${firstIncomplete.matchingRevisionNumber}` : ""}`
        : legacyIncomplete?.deurNumber
          ? `${legacyIncomplete.deurNumber}${legacyIncomplete.revision?.revisionNumber ? ` R${legacyIncomplete.revision.revisionNumber}` : ""}`
          : undefined;
      const message = (firstIncomplete?.status === "INCOMPLETE" || legacyIncomplete) && reference
        ? `Rental cannot be closed because ${reference} is still awaiting Customer acknowledgement.`
        : firstIncomplete?.reason ?? compliance.reason;
      reasons.push(message);
      checks.push({ code: `DEUR_${compliance.status}`, satisfied: false, message, ...(firstIncomplete?.rentalEquipmentLineId ? { rentalEquipmentLineId: firstIncomplete.rentalEquipmentLineId } : {}) });
    } else {
      checks.push({ code: "DEUR_COMPLIANT", satisfied: true, message: "All required DEUR and review evidence is complete." });
    }
  
    const hasBillingStatement = Boolean(aggregate.billing.hasStatement);
    const hasFinalizedInvoice = Boolean(aggregate.billing.invoicePreparationComplete);
    const hasUnbilledOperations = !hasFinalizedInvoice;

    if (!hasBillingStatement) reasons.push("A billing statement is required before closing.");
    if (!hasFinalizedInvoice) reasons.push("Invoice has not been finalized.");
    checks.push({ code: "BILLING_STATEMENT_CREATED", satisfied: hasBillingStatement, message: hasBillingStatement ? "Billing statement is created." : "Billing statement has not been created." });
    checks.push({ code: "INVOICE_FINALIZED", satisfied: hasFinalizedInvoice, message: hasFinalizedInvoice ? "Invoice is finalized." : "Invoice has not been finalized." });

    const collection = projectRentalCollectionStatus({ hasStatement: Boolean(aggregate.billing.hasStatement), totalInvoiced: aggregate.billing.invoiced, totalCollected: aggregate.billing.collected, outstandingBalance: aggregate.billing.outstanding });
    const hasOutstandingBalance = collection.outstandingBalance > 0 || (collection.status !== "Fully Collected" && collection.status !== "No Amount Due");
    if (hasOutstandingBalance) {
      const message = collection.status === "Partially Collected"
        ? `Rental cannot be closed. Invoice is partially collected; outstanding balance is ${collection.outstandingBalance.toFixed(2)}.`
        : `Rental cannot be closed. Outstanding balance: ${collection.outstandingBalance.toFixed(2)}.`;
      reasons.push(message);
    }
    checks.push({ code: "COLLECTION_SETTLED", satisfied: !hasOutstandingBalance, message: hasOutstandingBalance ? `Collection is ${collection.status}; outstanding balance is ${collection.outstandingBalance.toFixed(2)}.` : collection.status === "No Amount Due" ? "No amount is due." : "Invoice is fully collected." });
  
    return {
      canClose:
        reasons.length === 0,
  
      hasOpenAssignment,
  
      hasPendingOperations,
  
      hasOutstandingBalance,
  
      hasUnbilledOperations,
  
      reasons,
      checks,
    };
  }
