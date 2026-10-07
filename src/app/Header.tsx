import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, ChevronDown, Menu, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { getSystemRoleDisplayName } from "@/features/auth/domain/rolePermissions";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { changeOwnPassword } from "@/features/auth/services/changeOwnPassword";

export default function Header({ onMenu, search }: { onMenu(): void; search?: ReactNode }) {
  const { user, logout } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem("ui-theme") === "dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ui-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!menuOpen && !changing) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); setChanging(false); } };
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => { document.removeEventListener("keydown", closeOnEscape); document.removeEventListener("pointerdown", closeOutside); };
  }, [menuOpen, changing]);

  function signOut() { navigate("/login", { replace: true }); logout(); }
  const role = user ? getSystemRoleDisplayName(user.systemRoles[0]) ?? "Assigned User" : "";
  const resetSensitive = () => { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); };
  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await changeOwnPassword(authentication, user, currentPassword, newPassword, confirmation);
      setMessage(result.message);
      if (result.success) setChanging(false);
    } catch { setMessage("Password could not be changed. Please try again."); }
    finally { resetSensitive(); setBusy(false); }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
      <div className="flex items-center gap-4">
        <button aria-label="Toggle navigation" className="rounded-md p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={onMenu}><Menu size={22} /></button>
        <div className="min-w-0 flex-1" />
        {search && <div className="w-auto sm:w-full sm:max-w-xs xl:max-w-sm">{search}</div>}
        <button aria-label={dark ? "Use light mode" : "Use dark mode"} aria-pressed={dark} className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setDark((value) => !value)}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}<span className="hidden xl:inline">Dark mode</span>
          <span className={`relative h-5 w-9 rounded-full transition ${dark ? "bg-blue-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${dark ? "left-[18px]" : "left-0.5"}`} /></span>
        </button>
        <button aria-label="Notifications" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Bell size={18} /></button>
        {user && <div ref={menuRef} className="relative">
          <button type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="account-menu" className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800" onClick={() => setMenuOpen((value) => !value)}>
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white">{user.displayName.slice(0, 2).toUpperCase()}</span>
            <span aria-hidden="true" className="hidden min-w-0 xl:block"><span className="block max-w-36 truncate text-xs font-semibold">{user.displayName}</span><span className="block max-w-36 truncate text-[11px] text-slate-500">{role}</span></span>
            <ChevronDown aria-hidden="true" size={15} />
          </button>
          {menuOpen && <div id="account-menu" role="menu" className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b px-3 py-2"><b className="block">{user.displayName}</b><span className="block text-slate-500">{user.username}</span>{user.email && <span className="block break-all text-slate-500">{user.email}</span>}<span className="block text-slate-500">{user.systemRoles.map((r) => getSystemRoleDisplayName(r) ?? r).join(", ")}</span></div>
            {user.credentialMode !== "OPERATOR_PIN" && <button role="menuitem" type="button" className="w-full rounded px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setMenuOpen(false); setChanging(true); setMessage(""); }}>Change Password</button>}
            <button role="menuitem" type="button" className="w-full rounded border-t px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={signOut}>Sign out</button>
          </div>}
        </div>}
      </div>
      {message && !changing && <p role="status" className="text-right text-xs">{message}</p>}
      {changing && <div role="dialog" aria-modal="true" aria-label="Change Password" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={(event) => void submitPassword(event)} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 text-slate-900 shadow-xl"><h2 className="text-lg font-semibold">Change Password</h2><label className="block text-sm">Current password<input type="password" autoComplete="current-password" required value={currentPassword} disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} className="app-control mt-1 w-full" /></label><label className="block text-sm">New password<input type="password" autoComplete="new-password" required value={newPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)} className="app-control mt-1 w-full" /></label><label className="block text-sm">Confirm new password<input type="password" autoComplete="new-password" required value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} className="app-control mt-1 w-full" /></label>{message && <p role="alert" className="text-sm text-red-700">{message}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => { setChanging(false); resetSensitive(); }}>Cancel</button><button type="submit" disabled={busy} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : "Change Password"}</button></div></form></div>}
    </header>
  );
}
