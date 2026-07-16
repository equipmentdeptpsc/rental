import { Link, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";

export default function CustomerDetails() {
  const { id } = useParams();

  const { customers } =
    useCustomer();

  const { rentals } =
    useRental();

  const { getEquipment } = useEquipment();

  const customer = customers.find(
    (c) => c.id === id
  );

  if (!customer) {
    return (
      <div className="p-8">
        Customer not found.
      </div>
    );
  }

  const customerRentals =
    rentals.filter(
      (r) =>
        r.customer ===
        customer.companyName
    );

  return (
    <div className="space-y-8 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            {customer.companyName}
          </h1>

          <p className="text-slate-500">
            Customer Details
          </p>

        </div>

        <Link
          to={`/customers/edit/${customer.id}`}
        >
          <Button>
            Edit Customer
          </Button>
        </Link>

      </div>

      <div className="rounded-xl border bg-white p-6 space-y-2">

        <p>
          <strong>Code:</strong>{" "}
          {customer.customerCode}
        </p>

        <p>
          <strong>Contact:</strong>{" "}
          {customer.contactPerson}
        </p>

        <p>
          <strong>Phone:</strong>{" "}
          {customer.contactNumber}
        </p>

        <p>
          <strong>Email:</strong>{" "}
          {customer.email}
        </p>

        <p>
          <strong>Address:</strong>{" "}
          {customer.address}
        </p>

      </div>

      <div>

        <h2 className="mb-4 text-xl font-bold">
          Rental History
        </h2>

        <div className="overflow-hidden rounded-xl border bg-white">

          <table className="min-w-full">

            <thead className="bg-slate-100">

              <tr>

                <th className="p-3 text-left">
                  Equipment
                </th>

                <th className="p-3 text-left">
                  Project
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

              </tr>

            </thead>

            <tbody>

              {customerRentals.map(
                (rental) => (

                  <tr
                    key={rental.id}
                    className="border-t"
                  >

                    <td className="p-3">
                      {getRentalEquipmentLabel(getEquipment(rental.equipmentId))}
                    </td>

                    <td className="p-3">
                      {rental.project}
                    </td>

                    <td className="p-3">
                      {rental.status}
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}
