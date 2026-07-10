import type {
    BillingStatement,
  } from "../types";
  
  const STORAGE_KEY =
    "equipment-rental-billing-statements";
  
  class BillingStatementRepository {
    getAll(): BillingStatement[] {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );
  
      if (!raw) {
        return [];
      }
  
      return JSON.parse(
        raw
      ) as BillingStatement[];
    }
  
    getById(
      id: string
    ): BillingStatement | undefined {
      return this.getAll().find(
        (x) => x.id === id
      );
    }
  
    getByRentalId(
      rentalId: string
    ): BillingStatement[] {
      return this.getAll().filter(
        (x) =>
          x.rentalId === rentalId
      );
    }
  
    create(
      statement: BillingStatement
    ): void {
      const items =
        this.getAll();
  
      items.push(statement);
  
      this.save(items);
    }
  
    update(
      statement: BillingStatement
    ): void {
      const items =
        this.getAll().map((x) =>
          x.id === statement.id
            ? statement
            : x
        );
  
      this.save(items);
    }
  
    delete(
      id: string
    ): void {
      this.save(
        this.getAll().filter(
          (x) => x.id !== id
        )
      );
    }
  
    private save(
      items: BillingStatement[]
    ) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items)
      );
    }
  }
  
  export const billingStatementRepository =
    new BillingStatementRepository();