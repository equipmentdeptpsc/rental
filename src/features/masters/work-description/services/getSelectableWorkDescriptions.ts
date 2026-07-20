import type { WorkDescriptionRecord } from "../types";

interface Request {
  workDescriptions: WorkDescriptionRecord[];
  equipmentCategoryId?: string;
}

export function getSelectableWorkDescriptions({
  workDescriptions,
  equipmentCategoryId,
}: Request): WorkDescriptionRecord[] {
  const selectable = workDescriptions.filter((record) =>
    record.active && !record.deleted && record.operatorSelectable !== false
  );
  const filtered = equipmentCategoryId
    ? selectable.filter((record) => {
        const mappings = record.applicableEquipmentCategoryIds?.filter(Boolean) ?? [];
        return mappings.length === 0 || mappings.includes(equipmentCategoryId);
      })
    : selectable;

  return structuredClone(filtered).sort((left, right) =>
    (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name)
  );
}

export const getWorkDescriptionLabel = (record: WorkDescriptionRecord) => record.name;
