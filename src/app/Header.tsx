import { Link, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { getSystemRoleDefinition } from "@/features/auth/domain/rolePermissions";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";

export default function Dashboard({ onMenu }: { onMenu(): void }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    function signOut() {
      navigate("/login", { replace: true });
      logout();
    }

    return (
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <button aria-label="Open navigation" className="rounded p-2 hover:bg-slate-100 md:hidden" onClick={onMenu}><Menu size={22} /></button>
          <div className="min-w-0"><OrganizationBrand />
          <p className="mt-1 text-[10px] text-gray-500 sm:text-xs">Local UAT/demo authentication only</p>
          </div></div>
        {user ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{user.name} ({getSystemRoleDefinition(user.systemRoles[0])?.displayName ?? user.role})</span>
            <button className="rounded border px-3 py-2" onClick={signOut}>Sign Out</button>
          </div>
        ) : (
          <Link className="rounded bg-blue-600 px-3 py-2 text-sm text-white" to="/login">Sign In</Link>
        )}
      </header>
    );
  }
