import type { EquipmentRecord } from "../types";

export interface DuplicateResult {
  valid: boolean;
  message?: string;
}

export function validateDuplicateEquipment(
  equipment: EquipmentRecord[],
  current: EquipmentRecord
): DuplicateResult {

  const others = equipment.filter(
    e => e.id !== current.id
  );

  if (
    others.some(
      e => e.assetNo === current.assetNo
    )
  ) {
    return {
      valid: false,
      message:
        "Asset Number already exists."
    };
  }

  if (
    current.serialNumber &&
    others.some(
      e =>
        e.serialNumber ===
        current.serialNumber
    )
  ) {
    return {
      valid: false,
      message:
        "Serial Number already exists."
    };
  }

  if (
    current.engineNumber &&
    others.some(
      e =>
        e.engineNumber ===
        current.engineNumber
    )
  ) {
    return {
      valid: false,
      message:
        "Engine Number already exists."
    };
  }

  if (
    current.chassisNumber &&
    others.some(
      e =>
        e.chassisNumber ===
        current.chassisNumber
    )
  ) {
    return {
      valid: false,
      message:
        "Chassis Number already exists."
    };
  }

  return {
    valid: true,
  };

}