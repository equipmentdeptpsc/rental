import type { Page, PageRequest, RepositoryOperation } from "./contracts";

export type CommandRejection =
  | { kind: "NOT_FOUND"; entity: string; id: string }
  | { kind: "CONFLICT"; expectedVersion: number; currentVersion: number }
  | { kind: "VALIDATION"; issues: readonly { field: string; code: string; message: string }[] }
  | { kind: "FORBIDDEN"; code: string }
  | { kind: "PERSISTENCE_FAILURE"; code: string; retryable: boolean; correlationId?: string };

export type CommandResult<T> =
  | { ok: true; value: T; currentVersion: number; idempotencyKey: string; occurredAt: string }
  | { ok: false; rejection: CommandRejection };

export interface CommandMetadata {
  idempotencyKey: string;
  expectedVersion?: number;
  correlationId?: string;
}

export interface RemoteMutableRepository<T extends { id: string }> {
  getById(id: string): RepositoryOperation<T | undefined>;
  list(request: PageRequest): RepositoryOperation<Page<T>>;
  create(entity: T, metadata: CommandMetadata): RepositoryOperation<CommandResult<T>>;
  update(entity: T, metadata: CommandMetadata & { expectedVersion: number }): RepositoryOperation<CommandResult<T>>;
  softDelete(id: string, metadata: CommandMetadata & { expectedVersion: number }): RepositoryOperation<CommandResult<T>>;
  restore(id: string, metadata: CommandMetadata & { expectedVersion: number }): RepositoryOperation<CommandResult<T>>;
}

export interface AggregateChangeEvent {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  rentalId?: string;
  rentalLineId?: string;
  deurId?: string;
  equipmentId?: string;
  operatorId?: string;
  version: number;
  occurredAt: string;
  actorId?: string;
}

export interface ChangeSubscription {
  close(): void;
}

export interface ChangeFeed {
  subscribe(
    scope: { aggregateType: string; aggregateId?: string; afterEventId?: string },
    listener: (event: AggregateChangeEvent) => void,
  ): RepositoryOperation<ChangeSubscription>;
}
