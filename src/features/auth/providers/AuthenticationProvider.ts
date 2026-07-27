import type { AuthSession } from "../domain/session";

export interface AuthenticationRequest {
  readonly providerId: string;
  readonly payload: unknown;
}

export type ProviderAuthenticationResult =
  | { readonly success: true; readonly session: AuthSession }
  | {
      readonly success: false;
      readonly reason: "INVALID_CREDENTIALS" | "INACTIVE_USER";
      readonly message: string;
    };

export interface AuthenticationProvider {
  readonly id: string;
  authenticate(payload: unknown): ProviderAuthenticationResult;
  restoreSession(): AuthSession | null;
  logout(): void;
  clearSession(): void;
}
