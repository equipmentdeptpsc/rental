import type {
  PrefixRecord,
} from "../types";

export function generateEquipmentNumber(
  prefix: PrefixRecord
) {
  return `${prefix.code}-${String(
    prefix.nextNumber
  ).padStart(
    prefix.digits,
    "0"
  )}`;
}