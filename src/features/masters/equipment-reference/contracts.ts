export const equipmentReferenceKinds = ["brand", "model", "ownership", "location", "condition"] as const;
export type EquipmentReferenceKind = typeof equipmentReferenceKinds[number];
export interface EquipmentReferenceRecord {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  active: boolean;
  rowVersion: number;
}
export type EquipmentReferenceResult<T> = { success: true; value: T } | { success: false; code: string; message: string };
export interface EquipmentReferenceMasterRepository {
  list(kind: EquipmentReferenceKind): Promise<EquipmentReferenceResult<EquipmentReferenceRecord[]>>;
  save(command: {
    kind: EquipmentReferenceKind; operation: "CREATE" | "UPDATE" | "SET_ACTIVE"; id: string;
    commandId: string; idempotencyKey: string; name?: string; code?: string; description?: string;
    active?: boolean; expectedRowVersion?: number;
  }): Promise<EquipmentReferenceResult<EquipmentReferenceRecord>>;
}
