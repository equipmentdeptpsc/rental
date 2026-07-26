import { describe, expect, it } from "vitest";
import {
  getProjectCustomerLabel,
  getProjectCustomerOptions,
  validateProjectCustomer,
} from "@/features/project/services/projectCustomerService";
import type { CustomerRecord } from "@/features/customer/types";
import type { ProjectRecord } from "@/features/project/types";

const customer = (id: string, code: string, active = true): CustomerRecord => ({ id, customerCode: code, companyName: `Customer ${code}`, contactPerson: "", contactNumber: "", email: "", address: "", active });
const project = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({ id: "project-1", projectCode: "PRJ-000001", projectName: "Project", location: "", projectManager: "", status: "Planning", ...overrides });

describe("project customer relationship", () => {
  const activeA = customer("a", "CUS-000002");
  const activeB = customer("b", "CUS-000001");
  const inactive = customer("c", "CUS-000003", false);

  it("returns active customers in deterministic code order with readable labels", () => {
    expect(getProjectCustomerOptions([activeA, inactive, activeB])).toEqual([
      { value: "b", label: "CUS-000001 — Customer CUS-000001" },
      { value: "a", label: "CUS-000002 — Customer CUS-000002" },
    ]);
  });

  it("validates missing, unknown, inactive, and active customer IDs", () => {
    expect(validateProjectCustomer("", [activeA])).toBe("Select an active customer.");
    expect(validateProjectCustomer("missing", [activeA])).toBe("The selected customer could not be found.");
    expect(validateProjectCustomer("c", [inactive])).toBe("The selected customer is inactive.");
    expect(validateProjectCustomer("a", [activeA])).toBeUndefined();
  });

  it("prefers resolved customer labels while preserving legacy client compatibility", () => {
    expect(getProjectCustomerLabel(project({ customerId: "a", client: "Legacy" }), [activeA])).toBe("CUS-000002 — Customer CUS-000002");
    expect(getProjectCustomerLabel(project({ client: "Legacy Client" }), [])).toBe("Customer assignment required");
    expect(getProjectCustomerLabel(project({ customerId: "raw-id" }), [])).toBe("Customer unavailable");
  });

  it("keeps legacy dates optional and customerId as the new relationship key", () => {
    const legacy = project({ client: "Legacy", startDate: "2026-01-01", targetCompletion: "2026-12-31" });
    expect(legacy.client).toBe("Legacy");
    expect(legacy.customerId).toBeUndefined();
    expect(legacy.startDate).toBe("2026-01-01");
  });
});
