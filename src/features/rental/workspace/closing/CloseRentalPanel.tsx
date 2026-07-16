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

export default function CloseRentalPanel() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const {
    transitionRental,
  } = useRental();

  const {
    showToast,
  } = useToast();

  const readiness = useCloseReadiness();

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

          {aggregate.rental.status === "Returned" && readiness.canClose ? (
            <Button
              onClick={handleCloseRental}
            >
              Close Rental
            </Button>
          ) : (
            <p className="text-sm text-slate-500">
              {readiness.reasons.join(" ")}
            </p>
          )}

        </div>

      )}

    </div>
  );
}
