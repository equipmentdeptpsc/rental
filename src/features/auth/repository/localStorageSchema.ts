import type { IStorageService } from "@/core/storage/IStorageService";
import type { AuthSession } from "../domain/session";
import type { User } from "../domain/user";

export const AUTH_STORAGE_VERSION = 1;
export const AUTH_SESSION_STORAGE_KEY = "equipment-rental.auth.v1.session";
export const AUTH_USERS_STORAGE_KEY = "equipment-rental.auth.v1.users";

export interface LocalUserRecord {
  readonly user: User;
  readonly localPassword: string;
}

export interface LocalUsersEnvelope {
  readonly schemaVersion: typeof AUTH_STORAGE_VERSION;
  readonly records: readonly LocalUserRecord[];
}

export interface LocalSessionEnvelope {
  readonly schemaVersion: typeof AUTH_STORAGE_VERSION;
  readonly session: AuthSession;
}

export type StorageReadResult<T> =
  | { readonly status: "missing"; readonly value: null }
  | { readonly status: "valid"; readonly value: T }
  | { readonly status: "corrupt"; readonly value: null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoleCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

export function isUser(value: unknown): value is User {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.displayName === "string" &&
    (value.email === undefined || typeof value.email === "string") &&
    (value.companyId === undefined || typeof value.companyId === "string") &&
    Array.isArray(value.systemRoles) &&
    value.systemRoles.every(isRoleCode) &&
    (value.status === "active" || value.status === "inactive") &&
    (value.operatorId === undefined || typeof value.operatorId === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.userId === "string" &&
    typeof value.providerId === "string" &&
    typeof value.createdAt === "string" &&
    (value.expiresAt === undefined || typeof value.expiresAt === "string")
  );
}

export function isLocalUserRecord(value: unknown): value is LocalUserRecord {
  return (
    isObject(value) &&
    isUser(value.user) &&
    typeof value.localPassword === "string"
  );
}

export function safeStorageGet<T>(
  storage: IStorageService,
  key: string,
): StorageReadResult<T> {
  try {
    const value = storage.get<T>(key);
    return value === null
      ? { status: "missing", value: null }
      : { status: "valid", value };
  } catch {
    return { status: "corrupt", value: null };
  }
}

export function cloneUser(user: User): User {
  return Object.freeze({
    ...user,
    systemRoles: Object.freeze([...user.systemRoles]),
  });
}

export function cloneSession(session: AuthSession): AuthSession {
  return Object.freeze({ ...session });
}
