import { useAudit } from "../AuditContext";

interface Props {
  equipmentId: string;
}

export default function EquipmentAuditLog({ equipmentId }: Props) {
  const { logs } = useAudit();

  const filtered = logs.filter(
    (log) => log.equipmentId === equipmentId
  );

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        No audit history available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((log, index) => (
        <div
          key={index}
          className="rounded border border-slate-200 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="font-semibold">
              {log.action}
            </span>

            <span className="text-slate-400">
              #{index + 1}
            </span>
          </div>

          <div className="mt-2 text-slate-600">
            {log.action === "UPDATE" && (
              <>
                <div>
                  <strong>Before:</strong>{" "}
                  {log.before?.equipmentName ?? "—"}
                </div>

                <div>
                  <strong>After:</strong>{" "}
                  {log.after?.equipmentName ?? "—"}
                </div>
              </>
            )}

            {log.action === "CREATE" && (
              <div>
                Created: {log.after?.equipmentName}
              </div>
            )}

            {log.action === "DELETE" && (
              <div>
                Deleted: {log.before?.equipmentName}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}