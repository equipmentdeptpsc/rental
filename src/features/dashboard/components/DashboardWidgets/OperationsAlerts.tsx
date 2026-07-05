import type {
    FleetAlert,
  } from "../../services/dashboard.service";
  
  interface Props {
    alerts: FleetAlert[];
  }
  
  function getSeverityStyle(
    severity: FleetAlert["severity"]
  ) {
    switch (severity) {
      case "high":
        return {
          border:
            "border-red-300",
          background:
            "bg-red-50",
          badge:
            "bg-red-600 text-white",
        };
  
      case "medium":
        return {
          border:
            "border-amber-300",
          background:
            "bg-amber-50",
          badge:
            "bg-amber-500 text-white",
        };
  
      default:
        return {
          border:
            "border-blue-300",
          background:
            "bg-blue-50",
          badge:
            "bg-blue-600 text-white",
        };
    }
  }
  
  export default function OperationsAlerts({
    alerts,
  }: Props) {
  
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <div className="mb-5 flex items-center justify-between">
  
          <h2 className="text-lg font-semibold">
            Operations Alerts
          </h2>
  
          <span className="rounded bg-slate-100 px-3 py-1 text-sm font-medium">
            {alerts.length}
          </span>
  
        </div>
  
        {alerts.length === 0 ? (
  
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
  
            <div className="text-2xl">
              ✅
            </div>
  
            <p className="mt-2 font-medium text-green-700">
              No operational alerts.
            </p>
  
          </div>
  
        ) : (
  
          <div className="space-y-3">
  
            {alerts.map(
              (alert) => {
  
                const style =
                  getSeverityStyle(
                    alert.severity
                  );
  
                return (
  
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-4 ${style.border} ${style.background}`}
                  >
  
                    <div className="mb-2 flex items-center justify-between">
  
                      <div className="font-semibold">
  
                        {alert.title}
  
                      </div>
  
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ${style.badge}`}
                      >
                        {alert.category}
                      </span>
  
                    </div>
  
                    <p className="text-sm text-slate-600">
                      {alert.description}
                    </p>
  
                  </div>
  
                );
  
              }
            )}
  
          </div>
  
        )}
  
      </div>
    );
  
  }