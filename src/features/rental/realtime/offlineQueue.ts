export const OFFLINE_OPERATIONAL_COMMAND_SCHEMA_VERSION = 1;

export type OfflineCommandStatus = "PENDING" | "CLAIMED" | "RETRYABLE_FAILURE" | "TERMINAL_FAILURE";
export type OfflineCommandFailureClassification =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_EXPIRED"
  | "IDENTITY_CHANGED"
  | "TENANT_CHANGED"
  | "ASSIGNMENT_CHANGED"
  | "TRANSPORT"
  | "CONFLICT"
  | "VALIDATION"
  | "UNKNOWN";

export interface OfflineOperationalCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly operatorId?: string;
  readonly rentalId: string;
  readonly rentalLineId: string;
  readonly deurId?: string;
  readonly commandType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly clientCreatedAt: string;
  readonly lastAttemptAt?: string;
  readonly attemptCount: number;
  readonly status: OfflineCommandStatus;
  readonly failureClassification?: OfflineCommandFailureClassification;
  readonly schemaVersion: number;
  readonly claim?: { readonly ownerId: string; readonly expiresAt: string };
  readonly nextAttemptAt?: string;
}

export interface OfflineCommandScope {
  readonly tenantId: string;
  readonly operatorId: string;
}

export interface OfflineOperationalCommandQueue {
  enqueue(command: OfflineOperationalCommand): Promise<"ENQUEUED" | "DUPLICATE">;
  findById(id: string): Promise<OfflineOperationalCommand | undefined>;
  listPending(scope: OfflineCommandScope): Promise<readonly OfflineOperationalCommand[]>;
  listTerminal(scope: OfflineCommandScope): Promise<readonly OfflineOperationalCommand[]>;
  claimForReplay(id: string, ownerId: string, expiresAt: string, now: string): Promise<OfflineOperationalCommand | undefined>;
  markSucceeded(id: string, ownerId: string): Promise<void>;
  markRetryableFailure(id: string, ownerId: string, classification: OfflineCommandFailureClassification, nextAttemptAt: string, attemptedAt: string): Promise<void>;
  markTerminalFailure(id: string, ownerId: string, classification: OfflineCommandFailureClassification, attemptedAt: string): Promise<void>;
  releaseExpiredClaims(now: string, scope: OfflineCommandScope): Promise<number>;
  deleteAcknowledged(id: string): Promise<void>;
  clearTestFixtures(scope: OfflineCommandScope, idPrefix: string): Promise<number>;
  observe(listener: (scope: OfflineCommandScope) => void): () => void;
}

export interface ReplayIdentity {
  readonly tenantId: string;
  readonly userId: string;
  readonly operatorId?: string;
  readonly authenticated: boolean;
  readonly assignmentValid: boolean;
}

export interface OfflineCommandExecutionResult {
  readonly success: boolean;
  readonly retryable?: boolean;
  readonly classification?: OfflineCommandFailureClassification;
}

export interface OfflineOperationalCommandExecutor {
  execute(command: OfflineOperationalCommand): Promise<OfflineCommandExecutionResult>;
}

export interface ReplayCoordinator {
  runExclusive<T>(scopeKey: string, action: () => Promise<T>): Promise<T | undefined>;
}

const FORBIDDEN_PERSISTED_KEYS = /(?:access[_-]?token|refresh[_-]?token|service[_-]?(?:role|key)|api[_-]?key|review[_-]?(?:token|credential)|password|secret|session)/i;

export function validateOfflineOperationalCommand(command: OfflineOperationalCommand): void {
  if (command.schemaVersion !== OFFLINE_OPERATIONAL_COMMAND_SCHEMA_VERSION) throw new Error("OFFLINE_COMMAND_SCHEMA_UNSUPPORTED");
  if (!command.id || !command.tenantId || !command.userId || !command.rentalId || !command.rentalLineId || !command.idempotencyKey) {
    throw new Error("OFFLINE_COMMAND_INVALID");
  }
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_PERSISTED_KEYS.test(key)) throw new Error("OFFLINE_COMMAND_SENSITIVE_DATA");
      inspect(nested);
    }
  };
  inspect(command.payload);
}

export function compareOfflineCommands(a: OfflineOperationalCommand, b: OfflineOperationalCommand): number {
  return a.clientCreatedAt.localeCompare(b.clientCreatedAt) || a.id.localeCompare(b.id);
}
