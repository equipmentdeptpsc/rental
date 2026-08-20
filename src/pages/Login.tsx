import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getAuthorizedLandingPage } from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { useOptionalOperator } from "@/features/operators/context/OperatorContext";

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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form
        className="w-96 space-y-4 rounded-xl border bg-white p-6 shadow-sm"
        onSubmit={handleLogin}
      >
        <h1 className="text-2xl font-bold text-slate-800">Equipment System Login</h1>
        <label className="block text-sm font-medium text-slate-700">
          {operatorPinMode ? "Operator Code / Employee ID" : remote ? "Email" : "Username"}
          <input
            autoComplete={operatorPinMode ? "off" : "username"}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={isSubmitting}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {operatorPinMode ? "PIN" : "Password"}
          <input
            autoComplete={operatorPinMode ? "off" : "current-password"}
            inputMode={operatorPinMode ? "numeric" : undefined}
            minLength={operatorPinMode ? 4 : undefined}
            maxLength={operatorPinMode ? 6 : undefined}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {message && <p className="rounded bg-red-50 p-3 text-sm text-red-800" role="alert">{message}</p>}
        <button
          className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in…" : "Login"}
        </button>
        {!remote && <button type="button" className="w-full rounded border py-2 text-sm" onClick={() => { setOperatorPinMode((value) => !value); setUsername(""); setPassword(""); setMessage(""); }}>
          {operatorPinMode ? "Use Web User Password" : "Use Operator PIN"}
        </button>}
        <p className="text-center text-xs text-slate-400">
          {remote ? "Supabase authentication" : "Local UAT authentication only"}
        </p>
      </form>
    </div>
  );
}
