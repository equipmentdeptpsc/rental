import type { CostCodeRecord } from "@/features/masters/cost-code";

export interface EquipmentCostCodeOption {
  value: string;
  label: string;
}

export type EquipmentCostCodeDisplay =
  | { configured: true; code: string; name: string }
  | { configured: false; warning: "Cost Code not configured" };

export function getActiveCostCodeOptions(
  records: CostCodeRecord[],
): EquipmentCostCodeOption[] {
  return records
    .filter((record) => record.active && !record.deleted)
    .sort((left, right) =>
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code)
    )
    .map((record) => ({
      value: record.id,
      label: `${record.code} — ${record.description}`,
    }));
}

export function getEquipmentCostCodeDisplay(
  costCodeId: string | undefined,
  records: CostCodeRecord[],
): EquipmentCostCodeDisplay {
  const record = costCodeId
    ? records.find((candidate) => candidate.id === costCodeId)
    : undefined;

  return record
    ? { configured: true, code: record.code, name: record.description }
    : { configured: false, warning: "Cost Code not configured" };
}
