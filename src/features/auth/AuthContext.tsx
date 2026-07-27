import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { AuthSession } from "./domain/session";
import type { Permission } from "./domain/permission";
import type { LoginCredentials } from "./repository/AuthRepository";
import type { LoginResult } from "./services/AuthenticationService";
import type { AuthenticationRequest } from "./providers/AuthenticationProvider";
import { LOCAL_AUTH_PROVIDER_ID } from "./providers/local/LocalAuthenticationProvider";
import type { Role } from "./role";
import {
  adaptDomainUser,
  adaptLegacyUser,
  type AuthenticatedUser,
} from "./services/legacyAuthCompatibility";

export interface AuthContextType {
  user: AuthenticatedUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isSubmitting: boolean;
  authenticate: (request: AuthenticationRequest) => Promise<LoginResult>;
  login: {
    (credentials: LoginCredentials): Promise<LoginResult>;
    /** @deprecated Legacy test/workflow adapter. Production UI must use credentials. */
    (name: string, role: Role): Promise<LoginResult>;
  };
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  /** @deprecated Use session instead. Retained for legacy consumers during RBAC migration. */
  token: string | null;
  /** @deprecated Session restoration is automatic. Retained for isolated legacy tests. */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { authentication } = useApplicationDependenciesCompatibility();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshSession = useCallback(async () => {
    setIsInitializing(true);
    await Promise.resolve();
    const restored = authentication.authenticationService.initialize();
    if (restored.user && restored.session) {
      setUser(adaptDomainUser(restored.user));
      setSession(restored.session);
    } else {
      const legacyUser =
        authentication.legacyCompatibilityRepository.getCurrentUser();
      setUser(legacyUser ? adaptLegacyUser(legacyUser) : null);
      setSession(null);
    }
    setIsInitializing(false);
  }, [authentication]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const authenticate = useCallback(
    async (request: AuthenticationRequest): Promise<LoginResult> => {
      if (isSubmitting) {
        return {
          success: false,
          reason: "INVALID_CREDENTIALS",
          message: "A sign-in request is already in progress.",
        };
      }
      setIsSubmitting(true);
      try {
        await Promise.resolve();
        const result = authentication.authenticationService.login(request);
        if (result.success) {
          setUser(adaptDomainUser(result.user));
          setSession(result.session);
        }
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [authentication, isSubmitting],
  );

  const login = useCallback(
    async (credentialsOrName: LoginCredentials | string, legacyRole?: Role): Promise<LoginResult> => {
      if (typeof credentialsOrName === "string") {
        const legacy = authentication.legacyCompatibilityRepository.login(
          credentialsOrName,
          legacyRole ?? "Operator",
        );
        const adapted = adaptLegacyUser(legacy);
        const compatibilitySession: AuthSession = {
          id: crypto.randomUUID(),
          userId: adapted.id,
          providerId: "legacy-local-compatibility",
          createdAt: new Date().toISOString(),
        };
        setUser(adapted);
        setSession(compatibilitySession);
        return {
          success: true,
          session: compatibilitySession,
          user: adapted,
        };
      }
      return authenticate({
        providerId: LOCAL_AUTH_PROVIDER_ID,
        payload: credentialsOrName,
      });
    },
    [authenticate, authentication],
  );

  const logout = useCallback(() => {
    authentication.authenticationService.logout();
    authentication.legacyCompatibilityRepository.clear();
    setUser(null);
    setSession(null);
  }, [authentication]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isAuthenticated: user !== null,
      isInitializing,
      isSubmitting,
      authenticate,
      login,
      logout,
      hasPermission: (permission) =>
        authentication.authorizationService.hasPermission(user, permission),
      token: session?.id ?? null,
      refreshSession,
    }),
    [authenticate, authentication, isInitializing, isSubmitting, login, logout, refreshSession, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

/** Allows reusable Settings sections to render in isolation. */
export function useOptionalAuth(): AuthContextType | undefined {
  return useContext(AuthContext);
}
