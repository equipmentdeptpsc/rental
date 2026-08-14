import type { IStorageService } from "@/core/storage/IStorageService";
import { storage as defaultStorage } from "@/core/storage";
import type { User } from "../domain/user";
import type { UserRepository } from "./UserRepository";
import {
  AUTH_STORAGE_VERSION,
  AUTH_USERS_STORAGE_KEY,
  cloneUser,
  isLocalUserRecord,
  type LocalUserRecord,
  type LocalUsersEnvelope,
  safeStorageGet,
} from "./localStorageSchema";

export const LOCAL_AUTH_LIMITATIONS =
  "Local development credentials are stored as plain text. This adapter is not a production security boundary and provides no hashing, recovery, verification, or remote identity integration.";

export const DEFAULT_LOCAL_SEED_USERS = Object.freeze([
  {
    user: {
      id: "local-user-system-administrator",
      username: "administrator",
      displayName: "Administrator",
      systemRoles: ["system-administrator"],
      status: "active",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    localPassword: "Administrator123!",
  },
  {
    user: {
      id: "local-user-rental-operations",
      username: "rental.operations",
      displayName: "Rental Operations",
      systemRoles: ["rental-operations"],
      status: "active",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    localPassword: "RentalOperations123!",
  },
  {
    user: {
      id: "local-user-finance",
      username: "finance",
      displayName: "Finance",
      systemRoles: ["finance"],
      status: "active",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    localPassword: "Finance123!",
  },
  {
    user: {
      id: "local-user-management",
      username: "management",
      displayName: "Management",
      email: "equipmentdept.psc@gmail.com",
      systemRoles: ["management"],
      status: "active",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    },
    localPassword: "Management123!",
  },
] as const satisfies readonly LocalUserRecord[]);

type UsersReadResult =
  | { readonly status: "missing" | "corrupt"; readonly records: readonly LocalUserRecord[] }
  | { readonly status: "valid"; readonly records: readonly LocalUserRecord[] };

export class LocalUserRepository implements UserRepository {
  constructor(private readonly storage: IStorageService = defaultStorage) {}

  initializeSeedUsers(): readonly User[] {
    const stored = this.readRecords();
    if (stored.status === "corrupt" || stored.records.length > 0) {
      return stored.records.map(({ user }) => cloneUser(user));
    }

    const records = DEFAULT_LOCAL_SEED_USERS.map((record) => ({
      user: cloneUser(record.user),
      localPassword: record.localPassword,
    }));
    this.writeRecords(records);
    return records.map(({ user }) => cloneUser(user));
  }

  getUsers(): readonly User[] {
    return Object.freeze(
      this.readRecords().records.map(({ user }) => cloneUser(user)),
    );
  }

  getUserById(id: string): User | undefined {
    const record = this.readRecords().records.find(({ user }) => user.id === id);
    return record ? cloneUser(record.user) : undefined;
  }

  getUserByUsername(username: string): User | undefined {
    const normalized = normalizeUsername(username);
    const record = this.readRecords().records.find(
      ({ user }) => normalizeUsername(user.username) === normalized,
    );
    return record ? cloneUser(record.user) : undefined;
  }

  createUser(user: User, localPassword = ""): User {
    const records = this.readRecords().records;
    this.assertUniqueUser(records, user);
    const created = cloneUser(user);
    this.writeRecords([...records, { user: created, localPassword }]);
    return cloneUser(created);
  }

  updateUser(user: User): User {
    const records = this.readRecords().records;
    const index = records.findIndex(({ user: existing }) => existing.id === user.id);
    if (index < 0) throw new Error(`User not found: ${user.id}`);
    this.assertUniqueUser(records, user);

    const updated = cloneUser(user);
    const next = records.map((record, recordIndex) =>
      recordIndex === index ? { ...record, user: updated } : record,
    );
    this.writeRecords(next);
    return cloneUser(updated);
  }

  activateUser(id: string): User {
    return this.setStatus(id, "active");
  }

  deactivateUser(id: string): User {
    return this.setStatus(id, "inactive");
  }

  deleteUser(id:string):void{const records=this.readRecords().records;if(!records.some(({user})=>user.id===id))throw new Error("User not found.");this.writeRecords(records.filter(({user})=>user.id!==id))}

  validateLocalCredentials(username: string, password: string): User | undefined {
    const normalized = normalizeUsername(username);
    const record = this.readRecords().records.find(
      ({ user, localPassword }) =>
        normalizeUsername(user.username) === normalized &&
        localPassword === password &&
        user.status === "active",
    );
    return record ? cloneUser(record.user) : undefined;
  }

  replaceLocalPassword(id: string, newPassword: string): User {
    const records = this.readRecords().records;
    const index = records.findIndex(({ user }) => user.id === id);
    if (index < 0) throw new Error("User not found.");
    const updated = { ...cloneUser(records[index].user), updatedAt: new Date().toISOString() };
    this.writeRecords(records.map((record, recordIndex) => recordIndex === index
      ? { user: updated, localPassword: newPassword }
      : record));
    return cloneUser(updated);
  }

  private setStatus(id: string, status: User["status"]): User {
    const records=this.readRecords().records,index=records.findIndex(({user})=>user.id===id);
    if(index<0)throw new Error(`User not found: ${id}`);
    const updated={...cloneUser(records[index].user),status,updatedAt:new Date().toISOString()};
    this.writeRecords(records.map((record,recordIndex)=>recordIndex===index?{...record,user:updated}:record));
    return cloneUser(updated);
  }

  private assertUniqueUser(
    records: readonly LocalUserRecord[],
    candidate: User,
  ): void {
    const duplicate = records.some(
      ({ user }) =>
        user.id !== candidate.id &&
        user.companyId === candidate.companyId &&
        normalizeUsername(user.username) === normalizeUsername(candidate.username),
    );
    if (duplicate) {
      throw new Error("Username already exists.");
    }
    if(!candidate.email)return;
    const email=normalizeEmail(candidate.email);
    const duplicateEmail=records.find(({user})=>user.id!==candidate.id&&user.companyId===candidate.companyId&&user.email&&normalizeEmail(user.email)===email)?.user;
    if(duplicateEmail)throw new Error(`Email already exists. This email is assigned to ${duplicateEmail.displayName} (${duplicateEmail.username}). Edit the existing user and assign additional roles instead.`);
  }

  private readRecords(): UsersReadResult {
    const result = safeStorageGet<unknown>(this.storage, AUTH_USERS_STORAGE_KEY);
    if (result.status !== "valid") {
      return { status: result.status, records: [] };
    }

    const value = result.value;
    if (
      typeof value === "object" &&
      value !== null &&
      "schemaVersion" in value &&
      value.schemaVersion === AUTH_STORAGE_VERSION &&
      "records" in value &&
      Array.isArray(value.records) &&
      value.records.every(isLocalUserRecord)
    ) {
      return { status: "valid", records: value.records };
    }

    if (Array.isArray(value) && value.every(isLocalUserRecord)) {
      this.writeRecords(value);
      return { status: "valid", records: value };
    }

    return { status: "corrupt", records: [] };
  }

  private writeRecords(records: readonly LocalUserRecord[]): void {
    const envelope: LocalUsersEnvelope = {
      schemaVersion: AUTH_STORAGE_VERSION,
      records: records.map(({ user, localPassword }) => ({
        user: cloneUser(user),
        localPassword,
      })),
    };
    this.storage.set(AUTH_USERS_STORAGE_KEY, envelope);
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase();
}

function normalizeEmail(email:string):string{return email.trim().toLocaleLowerCase()}
