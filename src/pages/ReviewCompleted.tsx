export default function ReviewCompletedPage({ audience }: { audience: "customer" | "manager" }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-slate-50 p-6 text-slate-900">
      <h1 className="text-2xl font-bold">Review complete</h1>
      <p role="status">
        {audience === "manager"
          ? "The manager review has been completed. This page contains no review credential."
          : "The customer review has been completed. This page contains no review credential."}
      </p>
    </main>
  );
}
