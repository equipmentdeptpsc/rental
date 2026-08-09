export const BUSINESS_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBusinessEmail(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function isValidBusinessEmail(value: string): boolean {
  const normalized = normalizeBusinessEmail(value);
  return normalized.length <= 254 && !/[\r\n]/.test(value) && BUSINESS_EMAIL_PATTERN.test(normalized);
}
