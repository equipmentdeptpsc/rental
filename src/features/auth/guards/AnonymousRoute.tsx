import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getAuthorizedLandingPage } from "@/app/navigation/navigationConfig";
import { useAuth } from "../AuthContext";
import AccessDenied from "@/pages/AccessDenied";

export default function AnonymousRoute({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  if (isInitializing) return <div className="p-8 text-slate-500" role="status">Restoring session…</div>;
  if (!isAuthenticated) return <>{children}</>;
  const landing = getAuthorizedLandingPage(user, authentication.authorizationService);
  return landing ? <Navigate replace to={landing} /> : <AccessDenied />;
}
