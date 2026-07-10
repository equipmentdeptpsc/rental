import Button from "@/components/ui/Button";

import {
  useRentalWorkspaceAggregate,
} from "..";

import {
  closeRental,
} from "@/features/rental/application";

import {
  useRental,
} from "@/features/rental/context/RentalContext";

import {
  useEquipment,
} from "@/features/equipment/context/EquipmentContext";

import {
  useToast,
} from "@/components/ui/toast/ToastContext";

import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  useAudit,
} from "@/features/equipment/audit/AuditContext";

import {
  rentalReturnHistory,
  auditRentalClose,
} from "@/features/equipment/application";

export default function CloseRentalPanel() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const {
    updateRental,
  } = useRental();

  const {
    updateEquipment,
  } = useEquipment();

  const {
    showToast,
  } = useToast();

  const {
    log,
  } = useEquipmentHistory();

  const {
    logAction,
  } = useAudit();

  const closed =
    aggregate.rental.status ===
    "Returned";

  function handleCloseRental() {
    if (
      closed ||
      !aggregate.equipment
    ) {
      return;
    }

    const result =
      closeRental(
        aggregate.rental,
        aggregate.equipment
      );

    updateRental(
      result.rental
    );

    updateEquipment(
      result.equipment
    );

    logAction(
      auditRentalClose(
        aggregate.equipment,
        result.equipment
      )
    );

    log(
      rentalReturnHistory(
        result.equipment.id
      )
    );

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

          <Button
            onClick={
              handleCloseRental
            }
          >
            Close Rental
          </Button>

        </div>

      )}

    </div>
  );
}