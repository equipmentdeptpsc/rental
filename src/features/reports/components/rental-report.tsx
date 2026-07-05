import type { RentalRecord } from "@/features/rental/types";

interface Props {
  rentals: RentalRecord[];
}

export default function RentalReport({
  rentals,
}: Props) {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold">
          Rental Report
        </h2>
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">
              Customer
            </th>

            <th className="px-4 py-3 text-left">
              Date Out
            </th>

            <th className="px-4 py-3 text-left">
              Expected Return
            </th>

            <th className="px-4 py-3 text-left">
              Status
            </th>
          </tr>
        </thead>

        <tbody>
          {rentals.map((item) => (
            <tr
              key={item.id}
              className="border-t"
            >
              <td className="px-4 py-3">
                {item.customer}
              </td>

              <td className="px-4 py-3">
                {item.dateOut}
              </td>

              <td className="px-4 py-3">
                {item.expectedReturn}
              </td>

              <td className="px-4 py-3">
                {item.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}