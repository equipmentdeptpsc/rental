import { repositorySuccess } from "@/core/persistence";
import { equipmentStatusRepository } from "./EquipmentStatusRepository";
import { cloneEquipmentStatus,type ReadOnlyEquipmentStatusRepository } from "./ReadOnlyEquipmentStatusRepository";

export class LocalEquipmentStatusReadRepository implements ReadOnlyEquipmentStatusRepository {
  async list(){return repositorySuccess(equipmentStatusRepository.getAll().map(cloneEquipmentStatus));}
  async getById(id:string){const record=equipmentStatusRepository.getAll().find(item=>item.id===id);return repositorySuccess(record?cloneEquipmentStatus(record):null);}
}
