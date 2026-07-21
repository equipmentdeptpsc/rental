const HASH_VERSION = "sha256-canonical-json-v1" as const;

function normalizeNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("MIGRATION_NON_FINITE_NUMBER");
  if (Object.is(value, -0)) return "0";
  return value.toString();
}

function normalizeString(value:string):string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value).toISOString() : value;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return '{"$missing":true}';
  if (typeof value === "string") return JSON.stringify(normalizeString(value));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return normalizeNumber(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error(`MIGRATION_UNSUPPORTED_CANONICAL_TYPE:${typeof value}`);
}

export function canonicalizeMigrationValue(value: unknown): string { return canonical(value); }

export async function hashMigrationValue(value: unknown): Promise<{ algorithm: typeof HASH_VERSION; checksum: string }> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { algorithm: HASH_VERSION, checksum: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") };
}
