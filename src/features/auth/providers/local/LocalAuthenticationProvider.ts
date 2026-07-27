import type { UserRepository } from "../../repository/UserRepository";
import type { LoginCredentials } from "../../repository/AuthRepository";
import type {
  AuthenticationProvider,
  ProviderAuthenticationResult,
} from "../AuthenticationProvider";
import type { AuthRepository } from "../../repository/AuthRepository";

export const LOCAL_AUTH_PROVIDER_ID = "local";

export class LocalAuthenticationProvider implements AuthenticationProvider {
  readonly id = LOCAL_AUTH_PROVIDER_ID;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userRepository: UserRepository,
  ) {}

  authenticate(payload: unknown): ProviderAuthenticationResult {
    if (!isLoginCredentials(payload)) {
      return {
        success: false,
        reason: "INVALID_CREDENTIALS",
        message: "Invalid username or password.",
      };
    }

    const existing = this.userRepository.getUserByUsername(payload.username);
    if (existing?.status === "inactive") {
      return {
        success: false,
        reason: "INACTIVE_USER",
        message: "This user account is inactive. Contact a system administrator.",
      };
    }

    const session = this.authRepository.login(payload);
    return session
      ? { success: true, session }
      : {
          success: false,
          reason: "INVALID_CREDENTIALS",
          message: "Invalid username or password.",
        };
  }

  restoreSession() {
    return this.authRepository.restoreSession();
  }

  logout(): void {
    this.authRepository.logout();
  }

  clearSession(): void {
    this.authRepository.clearSession();
  }
}

function isLoginCredentials(value: unknown): value is LoginCredentials {
  return (
    typeof value === "object" &&
    value !== null &&
    "username" in value &&
    typeof value.username === "string" &&
    "password" in value &&
    typeof value.password === "string"
  );
}
