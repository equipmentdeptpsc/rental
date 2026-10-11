import type { CommercialPreparationDraft } from "./commercialPreparationValidation";

const sessionDrafts = new Map<string, Record<string, CommercialPreparationDraft>>();

export function readCommercialPreparationSessionDrafts(rentalId: string): Record<string, CommercialPreparationDraft> {
  return sessionDrafts.get(rentalId) ?? {};
}

export function preserveCommercialPreparationSessionDrafts(rentalId: string, drafts: Record<string, CommercialPreparationDraft>): void {
  sessionDrafts.set(rentalId, drafts);
}

export function clearCommercialPreparationSessionDrafts(rentalId: string): void {
  sessionDrafts.delete(rentalId);
}
