import { LocalEquipmentRepository } from "./LocalEquipmentRepository";

import type { IEquipmentRepository } from "./IEquipmentRepository";

export const equipmentRepository: IEquipmentRepository =
  new LocalEquipmentRepository();