import Button from "@/components/ui/Button";

import {
  useRentalWorkspaceAggregate,
} from "..";

import {
  useRental,
} from "@/features/rental/context/RentalContext";

import {
  useToast,
} from "@/components/ui/toast/ToastContext";

import { useCloseReadiness } from "./useCloseReadiness";
import { useState } from "react";
import { executeRentalBillingHandoff, prepareRentalBillingHandoff, type BillingHandoffReview } from "@/features/rental/billingstatement/services/executeRentalBillingHandoff";
import { billingHandoffAuditRepository } from "@/features/rental/billingstatement/repository/BillingHandoffAuditRepository";
import BillingHandoffReviewDialog from "./BillingHandoffReviewDialog";

export default function CloseRentalPanel() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const {
    transitionRental,
    returnRental,
  } = useRental();

  const {
    showToast,
  } = useToast();

  const readiness = useCloseReadiness();
  const [review, setReview] = useState<BillingHandoffReview>();
  const [executing, setExecuting] = useState(false);
  const [statementNumber, setStatementNumber] = useState<string>();

  const closed =
    aggregate.rental.status ===
    "Closed";

  function handleCloseRental() {
    if (
      closed ||
      !readiness.canClose
    ) {
      return;
    }

    const result = transitionRental(
      aggregate.rental.id,
      "Closed"
    );

    if (!result.success) {
      showToast(
        result.message ?? "Unable to close rental.",
        "error"
      );
      return;
    }

    showToast(
      "Rental closed successfully.",
      "success"
    );
  }
  function handleReturnEquipment(){
    if(!window.confirm(`Return ${aggregate.rentalEquipmentLines.length} Rental Equipment Line${aggregate.rentalEquipmentLines.length===1?"":"s"}, complete linked active Assignments, and mark the Rental Returned?`))return;
    const result=returnRental(aggregate.rental.id);
    if(!result.success){showToast(result.message??"Unable to return equipment.","error");return}
    showToast("Equipment returned and linked Assignments completed.","success");
  }

  function openBillingHandoff() {
    const prepared = prepareRentalBillingHandoff({ aggregate });
    if (prepared.status !== "ready") {
      showToast(prepared.issues.map((item) => item.message).join(" "), "error");
      return;
    }
    setReview(prepared.review);
  }

  async function confirmBillingHandoff() {
    if (!review || executing) return;
    setExecuting(true);
    await Promise.resolve();
    const result = executeRentalBillingHandoff({ aggregate, review }, {
      closeRental: (rentalId) => transitionRental(rentalId, "Closed"),
      audit: (event) => billingHandoffAuditRepository.record(event),
    });
    setExecuting(false);
    if (result.status === "created" || result.status === "already-created") {
      setStatementNumber(result.statementNumber); setReview(undefined);
      showToast(`Billing statement ${result.statementNumber} created and rental closed.`, "success");
      return;
    }
    if (result.status === "review-stale") {
      setReview(result.latestReview);
      showToast("Billing changed. Review the refreshed totals and confirm again.", "error");
      return;
    }
    showToast(result.issues.map((item) => item.message).join(" "), "error");
  }

  return (
    <div className="space-y-6">

      <div>

        <h2 className="text-2xl font-semibold">
          Close Rental
        </h2>

        <p className="text-slate-500">
          Finalize this rental transaction.
        </p>

      </div>

      {closed && (

        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">

          This rental has already been closed.

        </div>

      )}

      {!closed && (

        <div className="rounded-xl border bg-white p-6">
          {["Released","Active"].includes(aggregate.rental.status)&&<div className="mb-4 space-y-3"><h3 className="font-semibold">Return readiness</h3>{aggregate.rentalEquipmentLines.map((line,index)=><p className="rounded border p-3 text-sm" key={line.id}>Rental Line {index+1}: Equipment not returned · Assignment {line.assignmentId?"active or pending completion":"unavailable"}</p>)}<Button onClick={handleReturnEquipment}>Return Equipment and Complete Assignments</Button></div>}

          {aggregate.rental.status === "Returned" && readiness.canClose ? (
            <Button
              onClick={handleCloseRental}
            >
              Close Rental
            </Button>
          ) : aggregate.rental.status === "Returned" && !aggregate.billing.hasStatement ? (
            <Button onClick={openBillingHandoff}>
              Review Billing and Close Rental
            </Button>
          ) : (
            <p className="text-sm text-slate-500">
              {readiness.reasons.join(" ")}
            </p>
          )}

        </div>

      )}

      {statementNumber && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">Billing statement {statementNumber} was created.</div>}
      {review && (
        <BillingHandoffReviewDialog open review={review} currency={aggregate.contract?.currency ?? "PHP"} loading={executing} onCancel={() => setReview(undefined)} onConfirm={() => { void confirmBillingHandoff(); }} />
      )}

    </div>
  );
}
