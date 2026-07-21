import type { CustomerRecord } from "./types";
import type { CrudRepository } from "@/core/persistence";
import { createLegacyLocalRepositoryStorage } from "@/core/persistence";

const persistence = createLegacyLocalRepositoryStorage("Customer");

class CustomerRepository implements CrudRepository<CustomerRecord> {
  getAll(): CustomerRecord[] {
    return persistence.load<CustomerRecord[]>() ?? [];
  }

  getById(id: string) {
    return this.getAll().find(
      (c) => c.id === id
    );
  }

  create(customer: CustomerRecord) {
    const items = this.getAll();

    items.push(customer);

    persistence.save(items);
  }

  update(customer: CustomerRecord) {
    const items = this.getAll().map((item) =>
      item.id === customer.id
        ? customer
        : item
    );

    persistence.save(items);
  }

  delete(id: string) {
    const items = this.getAll().filter(
      (item) => item.id !== id
    );

    persistence.save(items);
  }
}

export const customerRepository =
  new CustomerRepository();
