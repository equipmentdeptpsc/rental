import { prefixRepository } from "@/features/settings/repository/prefixRepository";
import { equipmentBrandRepository } from "./equipment-brand/repository";
import { equipmentCategoryRepository } from "./equipment-category/repository";
import { equipmentConditionRepository } from "./equipment-condition/repository";
import { equipmentLocationRepository } from "./equipment-location/repository";
import { equipmentOwnershipRepository } from "./equipment-ownership/repository";
import { equipmentStatusRepository } from "./equipment-status/repository";
import { equipmentTypeRepository } from "./equipment-type/repository";
import { rentalStatusRepository } from "./rental-status/repository/RentalStatusRepository";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";

/** Ensures a blank browser can execute UAT without creating transactional demo data. */
export function initializeRequiredMasterData(): void {
  prefixRepository.getAll();
  equipmentTypeRepository.seedDefaults();
  equipmentBrandRepository.seedDefaults();
  equipmentCategoryRepository.seedDefaults();
  equipmentOwnershipRepository.seedDefaults();
  equipmentConditionRepository.seedDefaults();
  equipmentLocationRepository.seedDefaults();
  equipmentStatusRepository.seedDefaults();
  rentalStatusRepository.seedDefaults();
  deurShiftWindowRepository.getAll();
}
