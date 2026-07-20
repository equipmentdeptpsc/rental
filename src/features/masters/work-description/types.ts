export interface WorkDescriptionRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  deleted?: boolean;
  deletedAt?: number;
  sortOrder?: number;
  operatorSelectable?: boolean;
  requiresRemarks?: boolean;
  applicableEquipmentCategoryIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}
