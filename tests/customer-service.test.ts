import { describe, expect, it } from "vitest";

import {
  generateCustomerCode,
  validateCustomerContact,
  validateCustomerEmail,
} from "@/features/customer/services/customerService";
import type { CustomerRecord } from "@/features/customer/types";

const customer = (customerCode: string): CustomerRecord => ({
  id: customerCode, customerCode, companyName: "Customer", contactPerson: "Contact",
  contactNumber: "09171234567", email: "customer@example.com", address: "", active: true,
});

describe("customer service", () => {
  it("generates sequential codes from persisted records without reusing gaps", () => {
    expect(generateCustomerCode([])).toBe("CUS-000001");
    expect(generateCustomerCode([customer("CUS-000001"), customer("CUS-000003")])).toBe("CUS-000004");
  });

  it("ignores malformed legacy codes safely", () => {
    expect(generateCustomerCode([customer("legacy"), customer("CUS-000002")])).toBe("CUS-000003");
  });

  it("validates optional email and Philippine-compatible contact numbers", () => {
    expect(validateCustomerEmail(" ")).toBeUndefined();
    expect(validateCustomerEmail(" user@example.com ")).toBeUndefined();
    expect(validateCustomerEmail("bad email")).toBeDefined();
    expect(validateCustomerContact("0917 123-4567")).toBeUndefined();
    expect(validateCustomerContact("+63 (917) 123 4567")).toBeUndefined();
    expect(validateCustomerContact("0917abc4567")).toBeDefined();
  });
});
