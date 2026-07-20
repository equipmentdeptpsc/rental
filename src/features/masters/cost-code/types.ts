export type CostUnit =
  | "Hour"
  | "Day"
  | "Month"
  | "Trip"
  | "Lot"
  | "Kilometer"
  | "Cubic Meter"
  | "Ton";

export interface CostCodeRecord {

  id: string;

  code: string;

  description: string;

  /** Equipment classification used by equipment, rental, and DEUR snapshots. */
  equipmentClassification?: "Heavy" | "Light";

  /** Optional ordering and audit metadata for records created before this milestone. */
  sortOrder?: number;

  createdAt?: string;

  updatedAt?: string;

  defaultRate: number;

  unit: CostUnit;

  active: boolean;

  remarks?: string;

  deleted: boolean;

  deletedAt?: number;

}
