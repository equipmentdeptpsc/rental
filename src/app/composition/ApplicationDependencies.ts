import type { PersistenceAdapter } from "@/core/persistence";
import type { assignmentRepository } from "@/features/assignment/repository";
import type { rentalContractRepository } from "@/features/rental/repository/rentalContractRepository";
import type { rentalEquipmentLineRepository } from "@/features/rental/equipment-line";
import type { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import type { billingStatementRepository } from "@/features/rental/billingstatement/repository";
import type { prefixRepository } from "@/features/settings/repository/prefixRepository";
import type { costCodeRepository } from "@/features/masters/cost-code";
import type { activityCodeRepository } from "@/features/masters/activity-code";
import type { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import type { IEquipmentRepository } from "@/features/equipment/repository/IEquipmentRepository";
import type { IRentalRepository } from "@/features/rental/repository/IRentalRepository";
import type { ReadOnlyEquipmentStatusRepository } from "@/features/masters/equipment-status/repository";
import type { AuthRepository } from "@/features/auth/repository/AuthRepository";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import type { AuthenticationService } from "@/features/auth/services/AuthenticationService";
import type { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import type { LegacyAuthCompatibilityRepository } from "@/features/auth/repository/LegacyAuthCompatibilityRepository";
import type { AuthenticationProvider } from "@/features/auth/providers/AuthenticationProvider";

export interface RepositoryDependencies {
  equipment: IEquipmentRepository; assignment: typeof assignmentRepository; rental: IRentalRepository;
  rentalContract: typeof rentalContractRepository; rentalEquipmentLine: typeof rentalEquipmentLineRepository;
  deur: Pick<typeof deurRepository, "getAll" | "getById" | "getByRentalId" | "update" | "unlockBilling">; billingStatement: Pick<typeof billingStatementRepository, "getAll" | "getById" | "getByRentalId" | "search" | "create" | "update" | "delete">; prefix: typeof prefixRepository;
  costCode: typeof costCodeRepository; activityCode: typeof activityCodeRepository; deurShiftWindow: typeof deurShiftWindowRepository;
  equipmentStatusRead: ReadOnlyEquipmentStatusRepository;
}
export type EquipmentStatusSource="local"|"supabase";
export interface AuthenticationDependencies {
  authRepository: AuthRepository;
  authenticationProviders: readonly AuthenticationProvider[];
  userRepository: UserRepository;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  legacyCompatibilityRepository: LegacyAuthCompatibilityRepository;
}
export interface ApplicationDependencies { persistence: PersistenceAdapter; repositories: RepositoryDependencies; authentication: AuthenticationDependencies; configuration:{equipmentStatusSource:EquipmentStatusSource}; compatibility: { sharedLegacySingletons: readonly (keyof RepositoryDependencies)[] } }
export type ApplicationDependencyOverrides = { persistence?: PersistenceAdapter; repositories?: Partial<RepositoryDependencies>; authentication?: Partial<AuthenticationDependencies> };
