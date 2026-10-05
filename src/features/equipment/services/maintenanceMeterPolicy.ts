export const BETA_MAINTENANCE_TYPES = ["Hour Meter", "Mileage", "None", "Both"] as const;
export type BetaMaintenanceType = typeof BETA_MAINTENANCE_TYPES[number];
export type HistoricalMaintenanceType = "Engine Hours" | "Kilometers" | "Calendar Days";
export type EquipmentMaintenanceType = BetaMaintenanceType | HistoricalMaintenanceType;
export type EquipmentMeterRequirement = "hourMeter" | "odometer" | "none" | "both";

export function normalizeMaintenanceType(value: EquipmentMaintenanceType): BetaMaintenanceType {
  switch (value) {
    case "Engine Hours": return "Hour Meter";
    case "Kilometers": return "Mileage";
    case "Calendar Days": return "None";
    default: return value;
  }
}

export function meterRequirementForMaintenanceType(value: EquipmentMaintenanceType | null | undefined): EquipmentMeterRequirement | undefined {
  switch (value) {
    case "Hour Meter": case "Engine Hours": return "hourMeter";
    case "Mileage": case "Kilometers": return "odometer";
    case "Both": return "both";
    case "None": case "Calendar Days": return "none";
    default: return undefined;
  }
}
