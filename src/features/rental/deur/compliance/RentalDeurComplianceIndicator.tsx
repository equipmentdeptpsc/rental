import type { RentalDeurComplianceResult } from "./evaluateRentalDeurCompliance";

const styles: Record<RentalDeurComplianceResult["status"], string> = {
  COMPLIANT: "bg-green-100 text-green-800",
  PENDING_CORRECTION: "bg-yellow-100 text-yellow-800",
  DEUR_INCOMPLETE: "bg-orange-100 text-orange-800",
  MISSING_DEUR: "bg-red-100 text-red-800",
};
const labels: Record<RentalDeurComplianceResult["status"], string> = {
  COMPLIANT: "Compliant", PENDING_CORRECTION: "Pending Correction", DEUR_INCOMPLETE: "Draft DEUR", MISSING_DEUR: "Missing DEUR",
};

export default function RentalDeurComplianceIndicator({ result }: { result: RentalDeurComplianceResult }) {
  return <span title={result.reason} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[result.status]}`}>{labels[result.status]}</span>;
}
