import { useAudit } from "../AuditContext";

export default function RecentAuditActivity() {
  const { logs } = useAudit();

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">
          Recent Audit Activity
        </h2>

        <p className="text-sm text-slate-500">
          Latest equipment updates
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="py-10 text-center text-slate-500">
          No audit logs available.
        </div>
      ) : (
        <div className="space-y-3">
          {logs.slice(0, 5).map((log) => (
            <div
              key={`${log.equipmentId}-${log.timestamp}`}
              className="rounded-lg border p-4"
            >
              <div className="flex justify-between">
                <strong>
                  {log.action}
                </strong>

                <span className="text-xs text-slate-500">
                  {new Date(
                    log.timestamp
                  ).toLocaleString()}
                </span>
              </div>

              <div className="mt-2 text-sm">
                Equipment ID:
                {" "}
                {log.equipmentId}
              </div>

              <div className="text-sm text-slate-500">
                By {log.user}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}