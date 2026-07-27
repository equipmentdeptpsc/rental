import type { ReactNode } from "react";
import { useAuth } from "../AuthContext";
import type { Permission } from "../domain/permission";
import AccessDenied from "@/pages/AccessDenied";

export default function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <>{children}</> : <AccessDenied />;
}
