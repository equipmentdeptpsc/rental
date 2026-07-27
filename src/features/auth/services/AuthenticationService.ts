import type { AuthSession } from "../domain/session";
import type { User } from "../domain/user";
import type { UserRepository } from "../repository/UserRepository";
import type {
  AuthenticationProvider,
  AuthenticationRequest,
} from "../providers/AuthenticationProvider";

export type AuthenticationState = {
  readonly session: AuthSession | null;
  readonly user: User | null;
};

export type LoginResult =
  | { readonly success: true; readonly session: AuthSession; readonly user: User }
  | {
      readonly success: false;
      readonly reason:
        | "INVALID_CREDENTIALS"
        | "INACTIVE_USER"
        | "PROVIDER_UNAVAILABLE";
      readonly message: string;
    };

export class AuthenticationService {
  constructor(
    private readonly providers: readonly AuthenticationProvider[],
    private readonly userRepository: UserRepository,
  ) {}

  initialize(): AuthenticationState {
    const session = this.providers
      .map((provider) => provider.restoreSession())
      .find((candidate): candidate is AuthSession => candidate !== null) ?? null;
    if (!session) return { session: null, user: null };
    const user = this.userRepository.getUserById(session.userId);
    if (!user || user.status !== "active") {
      this.getProvider(session.providerId)?.clearSession();
      return { session: null, user: null };
    }
    return { session, user };
  }

  login(request: AuthenticationRequest): LoginResult {
    const provider = this.getProvider(request.providerId);
    if (!provider) {
      return {
        success: false,
        reason: "PROVIDER_UNAVAILABLE",
        message: "The selected authentication provider is not available.",
      };
    }

    const providerResult = provider.authenticate(request.payload);
    if (!providerResult.success) return providerResult;
    const { session } = providerResult;

    const user = this.userRepository.getUserById(session.userId);
    if (!user || user.status !== "active") {
      provider.clearSession();
      return {
        success: false,
        reason: "INVALID_CREDENTIALS",
        message: "Invalid username or password.",
      };
    }

    return { success: true, session, user };
  }

  logout(): void {
    this.providers.forEach((provider) => provider.logout());
  }

  private getProvider(id: string): AuthenticationProvider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }
}
