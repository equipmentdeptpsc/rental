import { useRental } from "@/features/rental/context/RentalContext";

export default function ActiveRentalsCard() {
  const { rentals } =
    useRental();

  const active = rentals.filter(
    (r) => r.status === "Active"
  );

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Active Rentals
      </h2>

      <div className="text-5xl font-bold text-green-600">
        {active.length}
      </div>

      <p className="mt-2 text-sm text-gray-500">
        Rentals currently deployed
      </p>
    </div>
  );
}