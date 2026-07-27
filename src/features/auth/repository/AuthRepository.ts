import type { AuthSession } from "../domain/session";

export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
}

export interface AuthRepository {
  login(credentials: LoginCredentials): AuthSession | null;
  logout(): void;
  getCurrentSession(): AuthSession | null;
  restoreSession(): AuthSession | null;
  persistSession(session: AuthSession): void;
  clearSession(): void;
}
