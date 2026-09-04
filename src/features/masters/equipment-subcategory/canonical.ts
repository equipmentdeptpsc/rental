import type { Page, RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository } from "@/core/remote";
import { repositorySuccess } from "@/core/persistence";
import { equipmentSubcategoryRepository } from "./repository";
import { equipmentCategoryRepository } from "../equipment-category/repository/EquipmentCategoryRepository";

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

export interface CanonicalEquipmentCategory { id: string; name: string; active: boolean }
export interface EquipmentCategoryReadRepository extends ReadOnlyRepository<CanonicalEquipmentCategory> {}

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

export class LocalEquipmentCategoryReadRepository implements EquipmentCategoryReadRepository {
  async list(): Promise<RepositoryResult<{ items: CanonicalEquipmentCategory[] }>> { return repositorySuccess({ items: equipmentCategoryRepository.getAll().filter((item) => item.active && !item.deleted).map((item) => ({ id: item.id, name: item.category, active: item.active })) }); }
  async search(query: string): Promise<RepositoryResult<{ items: CanonicalEquipmentCategory[] }>> { const items = equipmentCategoryRepository.getAll().filter((item) => item.active && !item.deleted).map((item) => ({ id: item.id, name: item.category, active: item.active })); const term = query.trim().toLowerCase(); return repositorySuccess({ items: items.filter((item) => !term || item.name.toLowerCase().includes(term)) }); }
  async getById(id: string): Promise<RepositoryResult<CanonicalEquipmentCategory | null>> { const items = equipmentCategoryRepository.getAll().filter((item) => item.active && !item.deleted).map((item) => ({ id: item.id, name: item.category, active: item.active })); return repositorySuccess(items.find((item) => item.id === id) ?? null); }
}
