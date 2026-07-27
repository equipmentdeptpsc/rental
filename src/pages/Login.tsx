import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getAuthorizedLandingPage } from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import { getSafeReturnTo } from "@/features/auth/routing/safeReturnTo";

export default function Login() {
  const { login, isSubmitting } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setMessage("");
    const result = await login({ username, password });
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
    const landing = getAuthorizedLandingPage(
      result.user,
      authentication.authorizationService,
    );
    navigate(returnTo ?? landing ?? "/access-denied", { replace: true });
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form
        className="w-96 space-y-4 rounded-xl border bg-white p-6 shadow-sm"
        onSubmit={handleLogin}
      >
        <h1 className="text-2xl font-bold text-slate-800">Equipment System Login</h1>
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            autoComplete="username"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={isSubmitting}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            autoComplete="current-password"
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
        <p className="text-center text-xs text-slate-400">
          Local UAT authentication only
        </p>
      </form>
    </div>
  );
}
