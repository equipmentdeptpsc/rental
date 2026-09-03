import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getAuthorizedLandingPage } from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { useOptionalOperator } from "@/features/operators/context/OperatorContext";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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
    <main className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[var(--app-bg)] px-4 py-8 text-[var(--app-text)] sm:px-6">
      <form
        className="app-card w-full max-w-md space-y-5 p-6 sm:p-8"
        onSubmit={handleLogin}
      >
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">PSC Equipment</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Equipment Rental Management System</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to continue to your operations workspace.</p>
        </header>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {operatorPinMode ? "Operator Code / Employee ID" : remote ? "Email or Username" : "Username"}
          <input
            autoComplete={operatorPinMode ? "off" : "username"}
            className="app-control mt-1"
            disabled={isSubmitting}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {operatorPinMode ? "PIN" : "Password"}
          <input
            autoComplete={operatorPinMode ? "off" : "current-password"}
            inputMode={operatorPinMode ? "numeric" : undefined}
            minLength={operatorPinMode ? 4 : undefined}
            maxLength={operatorPinMode ? 4 : undefined}
            pattern={operatorPinMode ? "[0-9]{4}" : undefined}
            className="app-control mt-1 pr-12"
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={passwordVisible ? "text" : "password"}
            value={password}
          />
          <span className="relative -mt-11 block h-11 pointer-events-none"><button type="button" className="pointer-events-auto absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={passwordVisible ? "Hide password" : "Show password"} onClick={() => setPasswordVisible((value) => !value)}>{passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span>
        </label>
        {message && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200" role="alert" aria-live="polite">{message}</p>}
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Signing in…" : "Sign In"}
        </button>
        {!remote && <button type="button" className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => { setOperatorPinMode((value) => !value); setUsername(""); setPassword(""); setPasswordVisible(false); setMessage(""); }}>
          {operatorPinMode ? "Use Web User Password" : "Use Operator PIN"}
        </button>}
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {remote ? "Supabase authentication" : "Local UAT authentication only"}
        </p>
      </form>
    </main>
  );
}
