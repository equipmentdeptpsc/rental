import type { Page, RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository } from "@/core/remote";
import { repositorySuccess } from "@/core/persistence";
import { equipmentSubcategoryRepository } from "./repository";

export interface CanonicalEquipmentSubcategory {
  id: string;
  categoryId: string;
  name: string;
  code?: string;
  active: boolean;
  usageCount: number;
  updatedAt: string;
  rowVersion: number;
}

export interface EquipmentSubcategoryCommandRepository {
  create(input: { commandId: string; idempotencyKey: string; equipmentSubcategoryId: string; categoryId: string; name: string; code?: string }): Promise<{ success: boolean; code?: string; value?: CanonicalEquipmentSubcategory }>;
  update(input: { commandId: string; idempotencyKey: string; equipmentSubcategoryId: string; name: string; code?: string; expectedRowVersion: number }): Promise<{ success: boolean; code?: string; value?: CanonicalEquipmentSubcategory }>;
  setActive(input: { commandId: string; idempotencyKey: string; equipmentSubcategoryId: string; expectedRowVersion: number }, active: boolean): Promise<{ success: boolean; code?: string; value?: CanonicalEquipmentSubcategory }>;
}

export interface EquipmentSubcategoryReadRepository extends ReadOnlyRepository<CanonicalEquipmentSubcategory> {
  listAssignable(categoryId: string): Promise<RepositoryResult<CanonicalEquipmentSubcategory[]>>;
}

export type EquipmentSubcategoryPage = RepositoryResult<Page<CanonicalEquipmentSubcategory>>;

const localRecord = (item: ReturnType<typeof equipmentSubcategoryRepository.getAll>[number]): CanonicalEquipmentSubcategory => ({ id: item.id, categoryId: item.categoryId, name: item.name, code: item.code, active: item.active, usageCount: 0, updatedAt: item.updatedAt, rowVersion: 1 });
export class LocalEquipmentSubcategoryReadRepository implements EquipmentSubcategoryReadRepository {
  async list() { return repositorySuccess({ items: equipmentSubcategoryRepository.getAll().map(localRecord) }); }
  async search(query: string) { const term = query.trim().toLowerCase(); return repositorySuccess({ items: equipmentSubcategoryRepository.getAll().map(localRecord).filter((item) => !term || `${item.name} ${item.code ?? ""}`.toLowerCase().includes(term)) }); }
  async getById(id: string) { return repositorySuccess(equipmentSubcategoryRepository.getById(id) ? localRecord(equipmentSubcategoryRepository.getById(id)!) : null); }
  async listAssignable(categoryId: string) { return repositorySuccess(equipmentSubcategoryRepository.listByCategory(categoryId).map(localRecord)); }
}
