import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";

export interface RemoteRowReader { requiredString(field: string): RepositoryResult<string>; nullableString(field: string, fallback?: string): RepositoryResult<string>; requiredBoolean(field: string): RepositoryResult<boolean>; requiredNumber(field: string): RepositoryResult<number>; enumeration<T extends string>(field: string, allowed: readonly T[]): RepositoryResult<T>; unknownFields(known: readonly string[]): string[] }

export function createRemoteRowReader(value: unknown, repository: string): RepositoryResult<RemoteRowReader> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed(repository, "Remote row is not an object.");
  const row = value as Record<string, unknown>;
  const invalid = <T>(field: string, expected: string): RepositoryResult<T> => malformed(repository, `Remote field '${field}' must be ${expected}.`, field);
  return repositorySuccess({
    requiredString: field => typeof row[field] === "string" ? repositorySuccess(row[field] as string) : invalid(field, "a string"),
    nullableString: (field, fallback = "") => row[field] === null || row[field] === undefined ? repositorySuccess(fallback) : typeof row[field] === "string" ? repositorySuccess(row[field] as string) : invalid(field, "a string or null"),
    requiredBoolean: field => typeof row[field] === "boolean" ? repositorySuccess(row[field] as boolean) : invalid(field, "a boolean"),
    requiredNumber: field => typeof row[field] === "number" && Number.isFinite(row[field]) ? repositorySuccess(row[field] as number) : invalid(field, "a finite number"),
    enumeration: <T extends string>(field: string, allowed: readonly T[]) => typeof row[field] === "string" && allowed.includes(row[field] as T) ? repositorySuccess(row[field] as T) : invalid(field, `one of ${allowed.join(", ")}`),
    unknownFields: known => Object.keys(row).filter(field => !known.includes(field)),
  });
}

function malformed<T>(repository: string, message: string, field?: string): RepositoryResult<T> { return repositoryFailure("REMOTE_ROW_MALFORMED", message, { context: { repository, field }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Reconcile the hosted row with the canonical schema." }); }
