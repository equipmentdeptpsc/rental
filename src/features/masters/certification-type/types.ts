export interface CertificationTypeRecord {
  id: string; name: string; active: boolean; usageCount: number; createdAt: string; updatedAt: string; rowVersion: number;
}
export interface CertificationTypeCommandRepository {
  create(input: { commandId: string; idempotencyKey: string; certificationTypeId: string; name: string }): Promise<{ success: boolean; code?: string; value?: CertificationTypeRecord }>;
  update(input: { commandId: string; idempotencyKey: string; certificationTypeId: string; name: string; expectedVersion: number }): Promise<{ success: boolean; code?: string; value?: CertificationTypeRecord }>;
  setActive(input: { commandId: string; idempotencyKey: string; certificationTypeId: string; expectedVersion: number }, active: boolean): Promise<{ success: boolean; code?: string; value?: CertificationTypeRecord }>;
}
