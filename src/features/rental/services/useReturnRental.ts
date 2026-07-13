import { useRental } from "../context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import {

    returnRental,
  
    canReturnRental,
  
    canReturnEquipment,
  
  } from "./ReturnRentalService";

import { useAudit } from "@/features/equipment/audit/AuditContext";

import {
  useEquipmentHistory,
} from "@/features/equipment/history";

import {
  auditRental,
  rentalHistory,
} from "@/features/equipment/application";

import type {
  RentalRecord,
} from "../types";

import type {
  EquipmentRecord,
} from "@/features/equipment/types";

export function useReturnRental() {

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

  function returnEquipment(
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

    const machine =
      equipment.find(
        (e: EquipmentRecord) =>
          e.id === rental.equipmentId
      );

    if (!machine) {

      return {
        success: false,
        message:
          "Equipment not found.",
      };

    }

    if (

        !canReturnRental(
      
          rental
      
        )
      
      ) {
      
        return {
      
          success: false,
      
          message:
      
            "Rental has already been returned.",
      
        };
      
      }

      if (

        !canReturnEquipment(
      
          machine
      
        )
      
      ) {
      
        return {
      
          success: false,
      
          message:
      
            "Equipment is not currently rented.",
      
        };
      
      }

    const result =
      returnRental(
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

      message:
        "Equipment returned successfully.",

    };

  }

  return {

    returnEquipment,

  };

}