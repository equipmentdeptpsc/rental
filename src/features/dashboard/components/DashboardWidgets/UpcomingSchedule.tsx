import type {
    MaintenanceRecord,
  } from "@/features/maintenance/types";
  
  import type {
    RentalRecord,
  } from "@/features/rental/types";
  
  interface Props {
    rentals: RentalRecord[];
    maintenance: MaintenanceRecord[];
  }
  
  export default function UpcomingSchedule({
    rentals,
    maintenance,
  }: Props) {
  
    const upcomingRentals =
      rentals
        .filter(
          (item) =>
            item.status === "Active" &&
            Boolean(item.expectedReturn)
        )
        .sort(
          (a, b) =>
            new Date(
              a.expectedReturn!
            ).getTime() -
            new Date(
              b.expectedReturn!
            ).getTime()
        )
        .slice(0, 5);
  
    const upcomingMaintenance =
      maintenance
        .filter(
          (item) =>
            item.status ===
            "Scheduled"
        )
        .sort(
          (a, b) =>
            new Date(
              a.scheduledDate
            ).getTime() -
            new Date(
              b.scheduledDate
            ).getTime()
        )
        .slice(0, 5);
  
    return (
  
      <div className="rounded-xl border bg-white p-6 shadow-sm">
  
        <h2 className="mb-6 text-lg font-semibold">
          Upcoming Schedule
        </h2>
  
        <div className="grid gap-8 lg:grid-cols-2">
  
          <div>
  
            <h3 className="mb-3 font-semibold text-slate-700">
              Upcoming Returns
            </h3>
  
            {upcomingRentals.length ===
            0 ? (
  
              <p className="text-sm text-slate-500">
                No upcoming returns.
              </p>
  
            ) : (
  
              <div className="space-y-3">
  
                {upcomingRentals.map(
                  (item) => (
  
                    <div
                      key={item.id}
                      className="rounded-lg border p-3"
                    >
  
                      <div className="font-medium">
                        {item.customer}
                      </div>
  
                      <div className="text-sm text-slate-600">
                        Return:
                        {" "}
                        {
                          item.expectedReturn
                        }
                      </div>
  
                    </div>
  
                  )
                )}
  
              </div>
  
            )}
  
          </div>
  
          <div>
  
            <h3 className="mb-3 font-semibold text-slate-700">
              Upcoming Maintenance
            </h3>
  
            {upcomingMaintenance.length ===
            0 ? (
  
              <p className="text-sm text-slate-500">
                No maintenance scheduled.
              </p>
  
            ) : (
  
              <div className="space-y-3">
  
                {upcomingMaintenance.map(
                  (item) => (
  
                    <div
                      key={item.id}
                      className="rounded-lg border p-3"
                    >
  
                      <div className="font-medium">
                        {
                          item.maintenanceType
                        }
                      </div>
  
                      <div className="text-sm text-slate-600">
                        Scheduled:
                        {" "}
                        {
                          item.scheduledDate
                        }
                      </div>
  
                    </div>
  
                  )
                )}
  
              </div>
  
            )}
  
          </div>
  
        </div>
  
      </div>
  
    );
  
  }
