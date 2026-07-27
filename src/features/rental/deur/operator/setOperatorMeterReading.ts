import type { DeurRecord } from "../types";

export function setOperatorMeterReading(input: {
  deur: DeurRecord;
  phase: "opening" | "closing";
  reading: number;
  readingType: "HOUR_METER" | "ODOMETER";
  timestamp: string;
}) {
  const { deur, phase, reading, readingType, timestamp } = input;
  if (!["Draft", "In Progress"].includes(deur.status) || deur.billingLocked) {
    return { success: false as const, message: "DEUR meter readings are not editable." };
  }
  if (!Number.isFinite(reading) || reading < 0) {
    return { success: false as const, message: "Meter reading must be a non-negative number." };
  }
  if (!Number.isFinite(Date.parse(timestamp))) {
    return { success: false as const, message: "Meter reading timestamp is invalid." };
  }
  if (phase === "closing" && deur.openingMeter === undefined) {
    return { success: false as const, message: "Beginning meter reading is required." };
  }
  if (phase === "closing" && reading < deur.openingMeter!) {
    return { success: false as const, message: "Ending reading cannot be lower than beginning reading." };
  }
  if (deur.meterReadingType && deur.meterReadingType !== readingType) {
    return { success: false as const, message: "This reading type does not match the DEUR." };
  }
  const record = {
    ...structuredClone(deur),
    meterReadingType: readingType,
    ...(phase === "opening" ? { openingMeter: reading } : { closingMeter: reading }),
    updatedAt: timestamp,
  };
  return { success: true as const, record };
}
