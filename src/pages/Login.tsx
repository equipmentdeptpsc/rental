import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getAuthorizedLandingPage } from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { useOptionalOperator } from "@/features/operators/context/OperatorContext";
import { Eye, EyeOff, Loader2, Mail, LockKeyhole, ShieldCheck } from "lucide-react";

export default function Login() {
  const { login, loginWithOperatorPin, isSubmitting } = useAuth();
  const { authentication, configuration } = useApplicationDependenciesCompatibility();
  const remote = configuration.persistenceMode === "remote";
  const navigate = useNavigate();
  const operatorContext = useOptionalOperator();
  const navigated = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [operatorPinMode, setOperatorPinMode] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setMessage("");
    const result = operatorPinMode
      ? await loginWithOperatorPin(username, password)
      : await login({ username, password });
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    if (navigated.current) return;
    navigated.current = true;
    const hasActiveOperatorLink = Boolean(
      result.user.operatorId &&
      operatorContext?.operators.some(
        (operator) =>
          operator.id === result.user.operatorId &&
          operator.status === "Active",
      ),
    );
    const landing = getAuthorizedLandingPage(
      result.user,
      authentication.authorizationService,
      { hasActiveOperatorLink },
    );
    navigate(landing ?? "/access-denied", { replace: true });
  }

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-[#f7f8fa] text-[#101820] dark:bg-slate-950 dark:text-slate-100">
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(22rem,46%)_1fr]">
        <aside className="relative flex min-h-[17rem] flex-col justify-between overflow-hidden bg-[linear-gradient(165deg,#122844_0%,#0b1a2e_62%)] px-7 py-8 text-white sm:px-12 lg:min-h-[100dvh] lg:px-14 lg:py-12">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 72%)" }} />
          <div className="relative flex items-center gap-3"><img className="h-14 w-14 shrink-0 rounded-lg object-contain" src="/branding/psc-equipment-logo.png" alt="PSC Equipment logo" /><div><p className="font-semibold tracking-wide">PSC Equipment</p><p className="text-xs text-white/55">Equipment Rental Management</p></div></div>
          <div className="relative mt-8 max-w-md lg:mt-0"><h2 className="font-semibold leading-tight tracking-tight text-3xl sm:text-4xl">Run every rental from one dashboard.</h2><p className="mt-4 max-w-[34ch] text-sm leading-6 text-white/65">Track fleet status, dispatch jobs, and manage contracts across every yard your team operates.</p></div>
          <div className="relative hidden gap-7 border-t border-white/15 pt-6 text-xs text-white/55 sm:flex"><span><strong className="block text-base text-white">Fleet</strong>Live equipment status</span><span><strong className="block text-base text-white">Jobs</strong>Dispatch & scheduling</span><span><strong className="block text-base text-white">Contracts</strong>Rentals & billing</span></div>
          <p className="relative hidden text-xs text-white/40 lg:block">© 2026 PSC Equipment. Internal operations workspace.</p>
        </aside>
        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
          <form className="w-full max-w-[380px] space-y-5" onSubmit={handleLogin}>
            <div className="mb-8 flex items-center justify-between"><span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{remote ? "UAT environment" : "Local environment"}</span><span className="text-xs text-slate-500">Authorized staff</span></div>
            <header className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Sign in</h1><p className="text-sm leading-6 text-slate-500 dark:text-slate-400">Enter your workspace credentials to continue.</p></header>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {operatorPinMode ? "Operator Code / Employee ID" : remote ? "Email or Username" : "Username"}
          <span className="relative mt-1 block"><Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={17} /><input
            autoComplete={operatorPinMode ? "off" : "username"}
            className="app-control mt-1"
            disabled={isSubmitting}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          /></span>
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {operatorPinMode ? "PIN" : "Password"}
          <span className="relative mt-1 block"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-400" size={17} /><input
            autoComplete={operatorPinMode ? "off" : "current-password"}
            inputMode={operatorPinMode ? "numeric" : undefined}
            minLength={operatorPinMode ? 4 : undefined}
            maxLength={operatorPinMode ? 4 : undefined}
            pattern={operatorPinMode ? "[0-9]{4}" : undefined}
            className="app-control pl-10 pr-12"
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={passwordVisible ? "text" : "password"}
            value={password}
          /><button type="button" className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={passwordVisible ? "Hide password" : "Show password"} onClick={() => setPasswordVisible((value) => !value)}>{passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span>
        </label>
        {message && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200" role="alert" aria-live="polite">{message}</p>}
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#f0a93a] px-4 py-2.5 font-semibold text-[#25190a] shadow-sm transition hover:bg-[#d6902a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5fa8] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Signing in…" : "Sign In"}
        </button>
        {!remote && <button type="button" className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setOperatorPinMode((value) => !value); setUsername(""); setPassword(""); setPasswordVisible(false); setMessage(""); }}>
          {operatorPinMode ? "Use Web User Password" : "Use Operator PIN"}
        </button>}
        <p className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-slate-500 dark:text-slate-400"><ShieldCheck size={14} aria-hidden="true" />{remote ? "Supabase authentication" : "Local UAT authentication only"}</p>
          </form>
        </section>
      </div>
    </main>
  );
}
