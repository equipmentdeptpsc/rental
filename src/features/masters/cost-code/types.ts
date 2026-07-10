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

  defaultRate: number;

  unit: CostUnit;

  active: boolean;

  remarks?: string;

  deleted: boolean;

  deletedAt?: number;

}