import type { DeurRecord } from "../types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import { storage } from "@/core/storage";

const STORAGE_KEY = "equipment-rental-deur";

class DeurRepository {

  getAll(): DeurRecord[] {

    return storage.get<DeurRecord[]>(STORAGE_KEY) ?? [];

  }

  getById(id: string) {
    return this.getAll().find(
      x => x.id === id
    );
  }

  getByRentalId(
    rentalId: string
  ) {

    return this.getAll().filter(
      x => x.rentalId === rentalId
    );

  }

  create(record: DeurRecord) {

    const all =
      this.getAll();

    all.push(record);

    this.saveAll(all);
    notifyRentalWorkspaceChange(record.rentalId);

  }

  update(record: DeurRecord) {

    const updated =
      this.getAll().map(x =>
        x.id === record.id
          ? record
          : x
      );

    this.saveAll(updated);
    notifyRentalWorkspaceChange(record.rentalId);

  }

  delete(id: string) {

    this.saveAll(
      this.getAll().filter(
        x => x.id !== id
      )
    );

  }

  lockBilling(
    deurIds: string[],
    billingStatementId: string
  ) {

    const updated =
      this.getAll().map(deur => {

        if (
          deurIds.includes(deur.id)
        ) {

          return {

            ...deur,

            billingLocked: true,

            billingStatementId,

          };

        }

        return deur;

      });

    this.saveAll(updated);

  }

  unlockBilling(
    billingStatementId: string
  ) {

    const updated =
      this.getAll().map(deur => {

        if (
          deur.billingStatementId !==
          billingStatementId
        ) {

          return deur;

        }

        return {

          ...deur,

          billingLocked: false,

          billingStatementId: undefined,

        };

      });

    this.saveAll(updated);

  }

  private saveAll(
    records: DeurRecord[]
  ) {

    storage.set(STORAGE_KEY, records);

  }

}

export const deurRepository =
  new DeurRepository();
