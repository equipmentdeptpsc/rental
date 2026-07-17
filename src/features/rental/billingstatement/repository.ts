import type {
    BillingStatement,
  } from "./types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import { storage } from "@/core/storage";

const STORAGE_KEY =
  "equipment-rental-billing-statements";

class BillingStatementRepository {

  getAll(): BillingStatement[] {
    try {
      const statements = storage.get<unknown>(STORAGE_KEY);
      return Array.isArray(statements) ? statements as BillingStatement[] : [];
    } catch {
      return [];
    }

  }

  getById(
    id: string
  ) {

    return this.getAll().find(
      x => x.id === id
    );

  }

  getByRentalId(rentalId: string) {
    return this.getAll().filter((statement) => statement.rentalId === rentalId);
  }

  search(
    keyword: string
  ) {

    const value =
      keyword
        .trim()
        .toLowerCase();

    if (!value) {
      return this.getAll();
    }

    return this.getAll().filter(

      x =>

        x.statementNo
          .toLowerCase()
          .includes(value)

        ||

        x.customer
          .toLowerCase()
          .includes(value)

        ||

        x.project
          .toLowerCase()
          .includes(value)

        ||

        x.approvalStatus
          .toLowerCase()
          .includes(value)

    );

  }

  create(
    statement: BillingStatement
  ) {

    const all =
      this.getAll();

    all.push(statement);

    this.saveAll(all);
    notifyRentalWorkspaceChange(statement.rentalId);

  }

  update(
    statement: BillingStatement
  ) {

    this.saveAll(

      this.getAll().map(

        x =>

          x.id === statement.id

            ? statement

            : x

      )

    );
    notifyRentalWorkspaceChange(statement.rentalId);

  }

  delete(
    id: string
  ) {

    const deleted =
      this.getById(id);

    if (!deleted) {
      return undefined;
    }

    this.saveAll(

      this.getAll().filter(

        x =>
          x.id !== id

      )

    );

    notifyRentalWorkspaceChange(deleted.rentalId);

    return deleted;

  }

  private saveAll(
    statements: BillingStatement[]
  ) {

    storage.set(STORAGE_KEY, statements);

  }

}

export const
billingStatementRepository =
new BillingStatementRepository();
