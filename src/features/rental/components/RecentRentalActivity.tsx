import { Link } from "react-router-dom";

import { useRental } from "../context/RentalContext";

export default function RecentRentalActivity() {
  const { rentals } = useRental();

  const recentRentals = [...rentals]
    .sort(
      (a, b) =>
        new Date(b.dateOut).getTime() -
        new Date(a.dateOut).getTime()
    )
    .slice(0, 5);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Recent Rentals
          </h2>

          <p className="text-sm text-slate-500">
            Latest rental transactions
          </p>
        </div>

        <Link
          to="/rentals"
          className="text-blue-600 text-sm hover:underline"
        >
          View All
        </Link>
      </div>

      {recentRentals.length === 0 ? (
        <div className="py-10 text-center text-slate-500">
          No rentals found.
        </div>
      ) : (
        <div className="space-y-3">
          {recentRentals.map((rental) => (
            <div
              key={rental.id}
              className="rounded-lg border p-4"
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">
                    {rental.customer}
                  </div>

                  <div className="text-sm text-slate-500">
                    {rental.project}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-medium ${
                      rental.status === "Returned"
                        ? "text-green-600"
                        : "text-blue-600"
                    }`}
                  >
                    {rental.status}
                  </div>

                  <div className="text-xs text-slate-500">
                    {rental.dateOut}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}