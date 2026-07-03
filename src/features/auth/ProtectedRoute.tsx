import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();

  // 🚫 NOT LOGGED IN → REDIRECT
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ✅ LOGGED IN → ALLOW ACCESS
  return <>{children}</>;
}