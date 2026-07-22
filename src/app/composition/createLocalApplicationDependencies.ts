import { storage } from "@/core/storage";
import { LocalStoragePersistenceAdapter } from "@/core/persistence";
import { equipmentRepository } from "@/features/equipment/repository";
import { assignmentRepository } from "@/features/assignment/repository";
import { rentalRepository } from "@/features/rental/repository";
import { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import { rentalEquipmentLineRepository } from "@/features/rental/equipment-line";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import { prefixRepository } from "@/features/settings/repository/prefixRepository";
import { costCodeRepository } from "@/features/masters/cost-code";
import { activityCodeRepository } from "@/features/masters/activity-code";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import type { ApplicationDependencies, ApplicationDependencyOverrides, RepositoryDependencies } from "./ApplicationDependencies";
import { LocalEquipmentStatusReadRepository } from "@/features/masters/equipment-status/repository";

const localRepositories: RepositoryDependencies = { equipment: equipmentRepository, assignment: assignmentRepository, rental: rentalRepository, rentalContract: rentalContractRepository, rentalEquipmentLine: rentalEquipmentLineRepository, deur: deurRepository, billingStatement: billingStatementRepository, prefix: prefixRepository, costCode: costCodeRepository, activityCode: activityCodeRepository, deurShiftWindow: deurShiftWindowRepository,equipmentStatusRead:new LocalEquipmentStatusReadRepository() };
export function createLocalApplicationDependencies(overrides: ApplicationDependencyOverrides = {}): ApplicationDependencies {
  return { persistence: overrides.persistence ?? new LocalStoragePersistenceAdapter(storage), repositories: { ...localRepositories, ...overrides.repositories },configuration:{equipmentStatusSource:"local"}, compatibility: { sharedLegacySingletons: Object.keys(localRepositories) as Array<keyof RepositoryDependencies> } };
}
