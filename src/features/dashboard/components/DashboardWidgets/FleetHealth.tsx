import type { FleetKPIs } from "../../services/dashboard.service";

interface Props {
  kpis: FleetKPIs;
}

interface MetricProps {
  label: string;
  value: number;
  color: string;
}

function ProgressBar({
  label,
  value,
  color,
}: MetricProps) {
  return (
    <div className="space-y-1">

      <div className="flex justify-between text-sm">
        <span>{label}</span>

        <span className="font-semibold">
          {value}%
        </span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">

        <div
          className={`h-full rounded-full ${color}`}
          style={{
            width: `${Math.min(
              Math.max(value, 0),
              100
            )}%`,
          }}
        />

      </div>

    </div>
  );
}

export default function FleetHealth({
  kpis,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h2 className="mb-6 text-lg font-semibold">
        Fleet Health
      </h2>

      <div className="space-y-5">

        <ProgressBar
          label="Fleet Availability"
          value={kpis.fleetAvailability}
          color="bg-green-500"
        />

        <ProgressBar
          label="Fleet Utilization"
          value={kpis.fleetUtilization}
          color="bg-blue-500"
        />

        <ProgressBar
          label="Equipment Under Maintenance"
          value={
            kpis.totalEquipment === 0
              ? 0
              : Math.round(
                  (kpis.maintenanceEquipment /
                    kpis.totalEquipment) *
                    100
                )
          }
          color="bg-amber-500"
        />

      </div>

    </div>
  );
}