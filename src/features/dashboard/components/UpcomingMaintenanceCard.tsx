import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";

export default function UpcomingMaintenanceCard() {
  const { maintenance } =
    useMaintenance();

  const upcoming = maintenance
    .filter(
      (m) =>
        m.status ===
        "Scheduled"
    )
    .sort((a, b) =>
      a.scheduledDate.localeCompare(
        b.scheduledDate
      )
    )
    .slice(0, 5);

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Upcoming Maintenance
      </h2>

      {upcoming.length === 0 ? (
        <p className="text-gray-500">
          No scheduled maintenance.
        </p>
      ) : (
        <div className="space-y-3">
          {upcoming.map((m) => (
            <div
              key={m.id}
              className="border-b pb-3 last:border-b-0"
            >
              <div className="font-medium">
                {m.maintenanceType}
              </div>

              <div className="text-sm text-gray-500">
                Scheduled: {m.scheduledDate}
              </div>

              <div className="text-sm text-gray-500">
                Current Reading:{" "}
                {m.currentReading}
              </div>

              <div className="text-sm text-gray-500">
                Target Reading:{" "}
                {m.scheduledReading}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}