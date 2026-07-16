import type {
    BillingStatement,
  } from "./types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";

const STORAGE_KEY =
  "equipment-rental-billing-statements";

class BillingStatementRepository {

  getAll(): BillingStatement[] {

    const raw =
      localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    return JSON.parse(raw);

  }

  getById(
    id: string
  ) {

    return this.getAll().find(
      x => x.id === id
    );

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

    return deleted;

  }

  private saveAll(
    statements: BillingStatement[]
  ) {

    localStorage.setItem(

      STORAGE_KEY,

      JSON.stringify(
        statements
      )

    );

  }

}

export const
billingStatementRepository =
new BillingStatementRepository();
