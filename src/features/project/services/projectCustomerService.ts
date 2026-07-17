import type { CustomerRecord } from "@/features/customer/types";
import type { ProjectRecord } from "../types";

export function getProjectCustomerOptions(customers: CustomerRecord[]) {
  return customers
    .filter((customer) => customer.active)
    .sort((left, right) => left.customerCode.localeCompare(right.customerCode))
    .map((customer) => ({ value: customer.id, label: `${customer.customerCode} — ${customer.companyName}` }));
}

export function getProjectCustomerLabel(project: Pick<ProjectRecord, "customerId" | "client">, customers: CustomerRecord[]) {
  const customer = project.customerId ? customers.find((item) => item.id === project.customerId) : undefined;
  return customer ? `${customer.customerCode} — ${customer.companyName}` : project.client || "Customer unavailable";
}

export function validateProjectCustomer(customerId: string, customers: CustomerRecord[]): string | undefined {
  if (!customerId) return "Select an active customer.";
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return "The selected customer could not be found.";
  if (!customer.active) return "The selected customer is inactive.";
  return undefined;
}
