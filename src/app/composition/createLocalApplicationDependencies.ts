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
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { LocalAuthRepository } from "@/features/auth/repository/LocalAuthRepository";
import { AuthenticationService } from "@/features/auth/services/AuthenticationService";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { LegacyAuthCompatibilityRepository } from "@/features/auth/repository/LegacyAuthCompatibilityRepository";
import { LocalAuthenticationProvider } from "@/features/auth/providers/local/LocalAuthenticationProvider";

const localRepositories: RepositoryDependencies = { equipment: equipmentRepository, assignment: assignmentRepository, rental: rentalRepository, rentalContract: rentalContractRepository, rentalEquipmentLine: rentalEquipmentLineRepository, deur: deurRepository, billingStatement: billingStatementRepository, prefix: prefixRepository, costCode: costCodeRepository, activityCode: activityCodeRepository, deurShiftWindow: deurShiftWindowRepository,equipmentStatusRead:new LocalEquipmentStatusReadRepository() };
export function createLocalApplicationDependencies(overrides: ApplicationDependencyOverrides = {}): ApplicationDependencies {
  const userRepository = overrides.authentication?.userRepository ?? new LocalUserRepository(storage);
  if (userRepository instanceof LocalUserRepository) userRepository.initializeSeedUsers();
  const authRepository = overrides.authentication?.authRepository ?? new LocalAuthRepository(storage, userRepository as LocalUserRepository);
  const authenticationProviders = overrides.authentication?.authenticationProviders ?? [
    new LocalAuthenticationProvider(authRepository, userRepository),
  ];
  const authenticationService = overrides.authentication?.authenticationService ?? new AuthenticationService(authenticationProviders, userRepository);
  const authentication = {
    authRepository,
    authenticationProviders,
    userRepository,
    authenticationService,
    authorizationService: overrides.authentication?.authorizationService ?? new AuthorizationService(),
    legacyCompatibilityRepository: overrides.authentication?.legacyCompatibilityRepository ?? new LegacyAuthCompatibilityRepository(storage),
  };
  return { persistence: overrides.persistence ?? new LocalStoragePersistenceAdapter(storage), repositories: { ...localRepositories, ...overrides.repositories },authentication,configuration:{equipmentStatusSource:"local"}, compatibility: { sharedLegacySingletons: Object.keys(localRepositories) as Array<keyof RepositoryDependencies> } };
}
