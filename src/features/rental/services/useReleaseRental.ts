import { useRental } from "../context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import {
  releaseRental,
} from "./ReleaseRentalService";

import { useAudit } from "@/features/equipment/audit/AuditContext";
import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  auditRental,
  rentalHistory,
} from "@/features/equipment/application";

export function useReleaseRental() {

  const {
    rentals,
    updateRental,
  } = useRental();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const {
    logAction,
  } = useAudit();
  
  const {
    log,
  } = useEquipmentHistory();

  function release(
    rentalId: string
  ) {

    const rental =
      rentals.find(
        r =>
          r.id === rentalId
      );

    if (!rental) {

      return {
        success: false,
        message:
          "Rental not found.",
      };

    }

    const machine =
      equipment.find(
        e =>
          e.id ===
          rental.equipmentId
      );

    if (!machine) {

      return {
        success: false,
        message:
          "Equipment not found.",
      };

    }

    const result =
      releaseRental(
        rental,
        machine
      );

    updateRental(
      result.rental
    );

    updateEquipment(
      result.equipment
    );

    logAction(
        auditRental(
          machine,
          result.equipment
        )
      );
      
      log(
        rentalHistory(
          machine.id
        )
      );

      return {
        success: true,
        message: "Equipment released successfully.",
      };
  }

  return {

    release,

  };

}