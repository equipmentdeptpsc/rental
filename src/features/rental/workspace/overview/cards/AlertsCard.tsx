import type {
    AlertItem,
  } from "../types";
  
  interface Props {
    alerts: AlertItem[];
  }
  
  export default function AlertsCard({
    alerts,
  }: Props) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-4 text-xl font-semibold">
          Alerts
        </h2>
  
        {alerts.length === 0 ? (
          <div className="text-sm text-slate-500">
            No alerts.
          </div>
        ) : (
          <div className="space-y-3">
  
            {alerts.map(alert => (
  
              <div
                key={alert.id}
                className="rounded border p-3"
              >
                <div className="font-semibold capitalize">
                  {alert.severity}
                </div>
  
                <div className="text-sm">
                  {alert.message}
                </div>
  
              </div>
  
            ))}
  
          </div>
        )}
  
      </div>
    );
  }