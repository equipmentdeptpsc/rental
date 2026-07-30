import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function RequireAuthentication({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitializing, isLoggingOut } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return <div className="p-8 text-slate-500" role="status">Restoring session…</div>;
  }
  if (!isAuthenticated) {
    if (isLoggingOut) return <Navigate replace to="/login" />;
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }
  return <>{children}</>;
}
