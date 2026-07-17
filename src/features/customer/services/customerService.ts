import type { CustomerRecord } from "../types";

const CODE_PATTERN = /^CUS-(\d{6})$/i;

export function generateCustomerCode(customers: CustomerRecord[]): string {
  const highest = customers.reduce((max, customer) => {
    const match = CODE_PATTERN.exec(customer.customerCode?.trim() ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CUS-${String(highest + 1).padStart(6, "0")}`;
}

export function normalizeCustomerContact(value: string): string { return value.trim(); }

export function validateCustomerContact(value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (!/^\+?[0-9()\s-]+$/.test(value.trim())) return "Contact number may contain digits, an optional leading +, spaces, hyphens, and parentheses only.";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? undefined : "Contact number must contain 7 to 15 digits.";
}

export function validateCustomerEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Enter a valid email address.";
}
