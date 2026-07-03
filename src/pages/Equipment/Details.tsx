import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";

export default function EquipmentDetails() {
  const { id } = useParams();

  const { getEquipment } = useEquipment();

  const { rentals } = useRental();

  const equipment = getEquipment(id ?? "");

  const rentalHistory = useMemo(
    () =>
      rentals.filter(
        (r) => r.equipmentId === id
      ),
    [rentals, id]
  );

  if (!equipment) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Equipment Not Found
        </h1>

        <Link to="/equipment">
          <Button className="mt-6">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">

      <div className="flex justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            {equipment.equipmentName}
          </h1>

          <p className="text-slate-500">
            {equipment.assetNo}
          </p>

        </div>

        <Link to="/equipment">
          <Button>
            Back
          </Button>
        </Link>

      </div>

      <div className="grid md:grid-cols-2 gap-6">

        <div className="rounded-xl bg-white border p-6">

          <h2 className="text-xl font-semibold mb-4">
            Equipment Information
          </h2>

          <div className="space-y-3">

            <Row
              label="Status"
              value={equipment.status}
            />

            <Row
              label="Category"
              value={equipment.category}
            />

            <Row
              label="Operator"
              value={equipment.operator || "-"}
            />

            <Row
              label="Project"
              value={equipment.project || "-"}
            />

            <Row
              label="Maintenance"
              value={equipment.maintenanceType}
            />

            <Row
              label="Current Reading"
              value={equipment.currentReading.toLocaleString()}
            />

          </div>

        </div>

        <div className="rounded-xl bg-white border p-6">

          <h2 className="text-xl font-semibold mb-4">
            Rental History
          </h2>

          {rentalHistory.length === 0 ? (
            <p className="text-slate-500">
              No rental history.
            </p>
          ) : (
            <div className="space-y-4">

              {rentalHistory.map((rental) => (
                <div
                  key={rental.id}
                  className="rounded border p-4"
                >
                  <div className="font-medium">
                    {rental.customer}
                  </div>

                  <div className="text-sm text-slate-500">
                    {rental.project}
                  </div>

                  <div className="text-sm">
                    {rental.dateOut}
                  </div>

                  <div className="text-sm">
                    {rental.status}
                  </div>
                </div>
              ))}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b pb-2">
      <span className="font-medium">
        {label}
      </span>

      <span>{value}</span>
    </div>
  );
}