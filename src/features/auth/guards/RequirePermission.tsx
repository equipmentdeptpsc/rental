import type { ReactNode } from "react";
import { useAuth } from "../AuthContext";
import type { Permission } from "../domain/permission";
import AccessDenied from "@/pages/AccessDenied";

export default function RequirePermission({
  permission,
  children,
}: {
  permission: Permission | readonly Permission[];
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return (Array.isArray(permission) ? permission.some((item) => hasPermission(item)) : hasPermission(permission as Permission)) ? <>{children}</> : <AccessDenied />;
}
