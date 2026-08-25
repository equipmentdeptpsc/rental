import type { RentalRecord } from "@/features/rental/types";

interface Props {
  rental: RentalRecord;
  billingMethod?: string;
}

function Row({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="flex justify-between border-b py-2">
      <span className="text-gray-500">
        {label}
      </span>

      <span className="font-medium">
        {value || "-"}
      </span>
    </div>
  );
}

export default function ContractSummaryCard({
  rental,
  billingMethod,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">
        Rental Summary
      </h3>

      <div className="space-y-1">

        <Row
          label="Customer"
          value={rental.customer}
        />

        <Row
          label="Project"
          value={rental.project}
        />

        <Row
          label="Rental Type"
          value={rental.rentalType ?? "Not specified"}
        />

        <Row
          label="Billing Method"
          value={billingMethod ?? rental.billingMethod ?? "Not specified"}
        />

        <Row
          label="Date Out"
          value={rental.dateOut}
        />

        <Row
          label="Expected Return"
          value={rental.expectedReturn}
        />

        <Row
          label="Status"
          value={rental.status}
        />

      </div>
    </div>
  );
}
