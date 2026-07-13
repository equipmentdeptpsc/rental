import { useRental } from "../context/RentalContext";

import {
  closeRental,
  canCloseRental,
} from "./CloseRentalService";

import { useAudit } from "@/features/equipment/audit/AuditContext";

import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  auditRental,
  rentalHistory,
} from "@/features/equipment/application";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import type {
  RentalRecord,
} from "../types";

import type {
  EquipmentRecord,
} from "@/features/equipment/types";

export function useCloseRental() {

  const {
    rentals,
    updateRental,
  } = useRental();

  const {
    equipment,
  } = useEquipment();

  const {
    logAction,
  } = useAudit();

  const {
    log,
  } = useEquipmentHistory();

  function close(
    rentalId: string
  ) {

    const rental =
      rentals.find(
        (r: RentalRecord) =>
          r.id === rentalId
      );

    if (!rental) {

      return {
        success: false,
        message:
          "Rental not found.",
      };

    }

    if (
      !canCloseRental(
        rental
      )
    ) {

        return {

            success: false,
          
            message:
          
              rental.status === "Closed"
          
                ? "Rental has already been closed."
          
                : "Only returned rentals can be closed.",
          
          };

    }

    const result =
      closeRental(
        rental
      );

    updateRental(
      result.rental
    );

    const machine =
      equipment.find(
        (e: EquipmentRecord) =>
          e.id ===
          rental.equipmentId
      );

    if (machine) {

      logAction(
        auditRental(
          machine,
          machine
        )
      );

      log(
        rentalHistory(
          machine.id
        )
      );

    }

    return {

      success: true,

      message:
        "Rental closed successfully.",

    };

  }

  return {

    close,

  };

}