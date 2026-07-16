import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

import type { User } from "./user";
import { storage } from "@/core/storage";

const AUTH_USER_KEY = "auth_user";
const AUTH_TOKEN_KEY = "auth_token";

interface AuthContextType {
  user: User | null;
  login: (name: string, role: User["role"]) => void;
  logout: () => void;
  isAuthenticated: boolean;
  token: string | null;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(
    () => storage.get<User>(AUTH_USER_KEY)
  );
  const [token, setToken] = useState<string | null>(
    () => storage.get<string>(AUTH_TOKEN_KEY)
  );

  useEffect(() => {
    refreshSession();
  }, []);

  function refreshSession() {
    const savedUser = storage.get<User>(AUTH_USER_KEY);
    const savedToken = storage.get<string>(AUTH_TOKEN_KEY);

    setUser(savedUser);
    setToken(savedToken);
  }

  function login(
    name: string,
    role: User["role"]
  ) {
    const newUser: User = {
      id: crypto.randomUUID(),
      name,
      role,
    };

    const newToken = crypto.randomUUID();

    storage.set(AUTH_USER_KEY, newUser);
    storage.set(AUTH_TOKEN_KEY, newToken);

    setUser(newUser);
    setToken(newToken);
  }

  function logout() {
    storage.remove(AUTH_USER_KEY);
    storage.remove(AUTH_TOKEN_KEY);

    setUser(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        token,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return context;
}
