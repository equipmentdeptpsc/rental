import type {
  CustomerReviewCommandRepository, DeurRevisionCommandRepository, MeterCheckpointCommandRepository,
  OperationalCommandRepositories, OperationalCommandResult, RentalClosureCommandRepository,
  BillingFinancialCommandRepository, RecoveryCommandRepository, RentalLifecycleCommandRepository, RentalReturnCommandRepository,
} from "./contracts";

type AllRepositories = CustomerReviewCommandRepository & DeurRevisionCommandRepository &
  MeterCheckpointCommandRepository & RentalReturnCommandRepository & RentalClosureCommandRepository &
  RentalLifecycleCommandRepository & BillingFinancialCommandRepository & RecoveryCommandRepository;

/** Keeps the new command surface explicit while legacy Local workflows continue through their existing services. */
export class UnavailableOperationalCommandRepository implements AllRepositories {
  constructor(
    private readonly code: "NOT_ENABLED" | "PERSISTENCE_FAILURE" = "PERSISTENCE_FAILURE",
    private readonly reason = "This command is not connected in the selected persistence mode.",
  ) {}
  private unavailable<T>(): Promise<OperationalCommandResult<T>> {
    return Promise.resolve({ success: false, code: this.code, message: this.reason, retryable: false, refreshRequired: false });
  }
  createRequest = () => this.unavailable<never>();
  acknowledge = () => this.unavailable<never>();
  reject = () => this.unavailable<never>();
  createCorrection = () => this.unavailable<never>();
  record = () => this.unavailable<never>();
  returnLine = () => this.unavailable<never>();
  returnAll = () => this.unavailable<never>();
  getReturnReadiness = () => this.unavailable<never>();
  getReadiness = () => this.unavailable<never>();
  close = () => this.unavailable<never>();
  createReserved = () => this.unavailable<never>();
  release = () => this.unavailable<never>();
  activate = () => this.unavailable<never>();
  cancel = () => this.unavailable<never>();
  generateEvidence = () => this.unavailable<never>();
  createStatement = () => this.unavailable<never>();
  consumeDeur = () => this.unavailable<never>();
  finalizeStatement = () => this.unavailable<never>();
  createInvoice = () => this.unavailable<never>();
  updateInvoice = () => this.unavailable<never>();
  reopenRental = () => this.unavailable<never>();
  reverseRentalReturn = () => this.unavailable<never>();
  voidBillingStatement = () => this.unavailable<never>();
  releaseDeurConsumption = () => this.unavailable<never>();
  cancelInvoice = () => this.unavailable<never>();
}

/**
 * Compatibility adapter for Local Mode. Existing Local review/correction/return/closure
 * services remain the authority until their UI callers are migrated to this bundle.
 */
export class LocalOperationalCommandRepository extends UnavailableOperationalCommandRepository {}

export function createUnavailableOperationalCommands(): OperationalCommandRepositories {
  const repository = new UnavailableOperationalCommandRepository();
  return {
    customerReviewCommands: repository,
    deurRevisionCommands: repository,
    meterCheckpointCommands: repository,
    rentalReturnCommands: repository,
    rentalClosureCommands: repository,
    rentalLifecycleCommands: repository,
    billingFinancialCommands: repository,
    recoveryCommands: repository,
  };
}

export function createDisabledRemoteOperationalCommands(): OperationalCommandRepositories {
  const repository = new UnavailableOperationalCommandRepository(
    "NOT_ENABLED",
    "Remote operational writes are disabled by configuration.",
  );
  return {
    customerReviewCommands: repository,
    deurRevisionCommands: repository,
    meterCheckpointCommands: repository,
    rentalReturnCommands: repository,
    rentalClosureCommands: repository,
    rentalLifecycleCommands: repository,
    billingFinancialCommands: repository,
    recoveryCommands: repository,
  };
}

export function createLocalOperationalCommands(): OperationalCommandRepositories {
  const repository = new LocalOperationalCommandRepository();
  return {
    customerReviewCommands: repository,
    deurRevisionCommands: repository,
    meterCheckpointCommands: repository,
    rentalReturnCommands: repository,
    rentalClosureCommands: repository,
    rentalLifecycleCommands: repository,
    billingFinancialCommands: repository,
    recoveryCommands: repository,
  };
}
