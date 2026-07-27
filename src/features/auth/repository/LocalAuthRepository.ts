import type { IStorageService } from "@/core/storage/IStorageService";
import { storage as defaultStorage } from "@/core/storage";
import type { AuthSession } from "../domain/session";
import type { AuthRepository, LoginCredentials } from "./AuthRepository";
import { LocalUserRepository } from "./LocalUserRepository";
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_STORAGE_VERSION,
  cloneSession,
  isAuthSession,
  type LocalSessionEnvelope,
  safeStorageGet,
} from "./localStorageSchema";

interface LocalAuthRepositoryOptions {
  readonly createId?: () => string;
  readonly now?: () => Date;
}

export class LocalAuthRepository implements AuthRepository {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly storage: IStorageService = defaultStorage,
    private readonly users = new LocalUserRepository(storage),
    options: LocalAuthRepositoryOptions = {},
  ) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  login(credentials: LoginCredentials): AuthSession | null {
    const user = this.users.validateLocalCredentials(
      credentials.username,
      credentials.password,
    );
    if (!user) return null;

    const session: AuthSession = {
      id: this.createId(),
      userId: user.id,
      providerId: "local",
      createdAt: this.now().toISOString(),
    };
    this.persistSession(session);
    return cloneSession(session);
  }

  logout(): void {
    this.clearSession();
  }

  getCurrentSession(): AuthSession | null {
    const result = safeStorageGet<unknown>(
      this.storage,
      AUTH_SESSION_STORAGE_KEY,
    );
    if (result.status !== "valid") return null;

    const value = result.value;
    if (
      typeof value === "object" &&
      value !== null &&
      "schemaVersion" in value &&
      value.schemaVersion === AUTH_STORAGE_VERSION &&
      "session" in value &&
      isAuthSession(value.session)
    ) {
      return cloneSession(value.session);
    }

    if (isAuthSession(value)) {
      this.persistSession(value);
      return cloneSession(value);
    }

    return null;
  }

  restoreSession(): AuthSession | null {
    const session = this.getCurrentSession();
    if (!session) return null;

    const user = this.users.getUserById(session.userId);
    const expiresAt = session.expiresAt
      ? Date.parse(session.expiresAt)
      : Number.POSITIVE_INFINITY;

    if (!user || user.status !== "active" || expiresAt <= this.now().getTime()) {
      this.clearSession();
      return null;
    }

    return cloneSession(session);
  }

  persistSession(session: AuthSession): void {
    if (!isAuthSession(session)) throw new Error("Invalid authentication session");
    const envelope: LocalSessionEnvelope = {
      schemaVersion: AUTH_STORAGE_VERSION,
      session: cloneSession(session),
    };
    this.storage.set(AUTH_SESSION_STORAGE_KEY, envelope);
  }

  clearSession(): void {
    this.storage.remove(AUTH_SESSION_STORAGE_KEY);
  }
}
