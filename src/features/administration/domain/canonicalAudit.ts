export interface CanonicalAuditEvent {
  readonly id: string;
  readonly companyId?: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly action: string;
  readonly actorId?: string;
  readonly actorName?: string;
  readonly occurredAt: string;
  readonly correlationId?: string;
}
