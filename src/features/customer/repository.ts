import type { CustomerRecord } from "./types";
import type { CrudRepository } from "@/core/persistence";

const STORAGE_KEY = "customer_records";

class CustomerRepository implements CrudRepository<CustomerRecord> {
  getAll(): CustomerRecord[] {
    const data = localStorage.getItem(STORAGE_KEY);

    if (!data) return [];

    return JSON.parse(data);
  }

  getById(id: string) {
    return this.getAll().find(
      (c) => c.id === id
    );
  }

  create(customer: CustomerRecord) {
    const items = this.getAll();

    items.push(customer);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }

  update(customer: CustomerRecord) {
    const items = this.getAll().map((item) =>
      item.id === customer.id
        ? customer
        : item
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }

  delete(id: string) {
    const items = this.getAll().filter(
      (item) => item.id !== id
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }
}

export const customerRepository =
  new CustomerRepository();
