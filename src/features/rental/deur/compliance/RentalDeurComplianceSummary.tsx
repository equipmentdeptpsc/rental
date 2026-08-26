import type { RentalDeurExpectationPolicy } from "@/features/rental/types";
import type { RentalDeurComplianceResult } from "./evaluateRentalDeurCompliance";

export function expectationPolicyLabel(policy?: RentalDeurExpectationPolicy) {
  return policy?.frequency === "PER_WORKDAY" ? "Per Workday" : policy?.frequency === "PER_SHIFT" ? `Per Shift — ${policy.expectedShiftCodes?.join(", ")}` : policy?.frequency === "ON_DEMAND" ? "On Demand" : "Legacy Rental Fallback";
}

export default function RentalDeurComplianceSummary({ result, policy, policyStaged = false, onWaive }: { result: RentalDeurComplianceResult; policy?: RentalDeurExpectationPolicy; policyStaged?: boolean; onWaive?:(expectation:RentalDeurComplianceResult["expectations"][number])=>void }) {
  return <>
    <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-xs text-slate-600">
      <span>Expected: <strong>{result.expectedCount}</strong></span><span>Acknowledged: <strong>{result.compliantCount}</strong></span>
      <span>Waived: <strong>{result.waivedCount}</strong></span>
      <span>Incomplete: <strong>{result.incompleteCount}</strong></span><span>Missing: <strong>{result.missingCount}</strong></span>
      <span>Pending Correction: <strong>{result.pendingCorrectionCount}</strong></span><span>Policy: <strong>{expectationPolicyLabel(policy)}{policyStaged ? " (Draft; activates at reservation)" : ""}</strong></span>
      {result.shiftWindowSource && <span>Windows: <strong>{result.shiftWindowSource === "IMMUTABLE_RENTAL_SNAPSHOT" ? "Immutable Rental Shift Window" : "Legacy Live Shift Window"}</strong></span>}
    </div>
    {result.expectations.length > 0 && <div className="mt-4 overflow-x-auto border-t pt-4"><table className="min-w-full text-xs">
      <thead><tr>{["Work Date", "Shift", "Window", "Due State", "Compliance Status", "DEUR", "Reason",...(onWaive?["Action"]:[])].map((heading) => <th key={heading} className="px-2 py-1 text-left">{heading}</th>)}</tr></thead>
      <tbody>{result.expectations.map((expectation) => <tr key={expectation.expectationId} className="border-t"><td className="px-2 py-1">{expectation.workDate}</td><td className="px-2 py-1">{expectation.shiftCode ?? "—"}</td><td className="px-2 py-1">{expectation.startTime && expectation.endTime ? `${expectation.startTime}–${expectation.endTime}${expectation.crossesMidnight ? " next day" : ""}` : "—"}</td><td className="px-2 py-1">{expectation.expectationStatus.replaceAll("_", " ")}</td><td className="px-2 py-1">{expectation.status.replaceAll("_", " ")}</td><td className="px-2 py-1">{expectation.matchingDeurNumber ?? expectation.matchingEffectiveDeurId ?? "—"}{expectation.matchingRevisionNumber ? ` R${expectation.matchingRevisionNumber}` : ""}</td><td className="px-2 py-1">{expectation.reason}</td>{onWaive&&<td className="px-2 py-1">{expectation.status==="MISSING"&&expectation.expectationStatus==="DUE"&&expectation.expectationFingerprint?<button type="button" className="rounded border border-amber-600 px-2 py-1 text-amber-800" onClick={()=>onWaive(expectation)}>Waive</button>:"—"}</td>}</tr>)}</tbody>
    </table></div>}
  </>;
}
