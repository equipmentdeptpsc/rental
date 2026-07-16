import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [role, setRole] =
    useState<"Admin" | "Operator">("Admin");

  function handleLogin() {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }

    login(name, role);
    navigate(searchParams.get("returnTo") || "/equipment");
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-96 rounded-xl border bg-white p-6 shadow-sm space-y-4">

        <h1 className="text-2xl font-bold text-slate-800">
          Equipment System Login
        </h1>

        {/* NAME INPUT */}
        <input
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm"
        />

        {/* ROLE SELECT */}
        <select
          value={role}
          onChange={(e) =>
            setRole(
              e.target.value as "Admin" | "Operator"
            )
          }
          className="w-full rounded border px-3 py-2 text-sm"
        >
          <option value="Admin">Admin</option>
          <option value="Operator">Operator</option>
        </select>

        {/* LOGIN BUTTON */}
        <button
          onClick={handleLogin}
          className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700"
        >
          Login
        </button>

        <p className="text-xs text-slate-400 text-center">
          Demo authentication only (local storage)
        </p>
      </div>
    </div>
  );
}
