import { Link } from "react-router-dom";

export default function AccessDenied() {
  return (
    <main className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
      <p className="mt-3 text-slate-600">
        Your account does not have permission to access this page.
      </p>
      <Link className="mt-6 inline-block text-blue-700 underline" to="/">
        Return to the application
      </Link>
    </main>
  );
}
