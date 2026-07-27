import { storage } from "@/core/storage";
import { notifyRentalWorkspaceChange } from "../workspace/workspaceRefresh";
import type { CollectionTransaction } from "./types";

export const COLLECTION_STORAGE_KEY = "equipment-rental-collections";
const clone = <T,>(value: T): T => structuredClone(value);

export const collectionRepository = {
  getAll(): CollectionTransaction[] {
    const value = storage.get<unknown>(COLLECTION_STORAGE_KEY);
    return Array.isArray(value) ? clone(value as CollectionTransaction[]) : [];
  },
  getByStatementId(statementId: string) {
    return this.getAll().filter((item) => item.statementId === statementId);
  },
  getByRentalId(rentalId: string) {
    return this.getAll().filter((item) => item.rentalId === rentalId);
  },
  create(transaction: CollectionTransaction) {
    const all = this.getAll();
    if (all.some((item) => item.id === transaction.id || (item.statementId === transaction.statementId && item.referenceNumber.toLocaleLowerCase() === transaction.referenceNumber.toLocaleLowerCase()))) {
      throw new Error("This Collection transaction was already recorded.");
    }
    storage.set(COLLECTION_STORAGE_KEY, [...all, clone(transaction)]);
    notifyRentalWorkspaceChange(transaction.rentalId);
    return clone(transaction);
  },
};
