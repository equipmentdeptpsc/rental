import type { RentalRecord } from "@/features/rental/types";

interface Props {
  rental: RentalRecord;
  equipmentLabel: string;
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-2 text-xl font-semibold">
        {value}
      </div>
    </div>
  );
}

export default function RentalKPICards({
  rental,
  equipmentLabel,
}: Props) {
  const today = new Date();

  const dateOut = new Date(rental.dateOut);

  const expected = rental.expectedReturn ? new Date(rental.expectedReturn) : undefined;

  const daysOnRent =
    Math.max(
      1,
      Math.ceil(
        (today.getTime() -
          dateOut.getTime()) /
          86400000
      )
    );

  const remainingDays = expected
    ? Math.ceil((expected.getTime() - today.getTime()) / 86400000)
    : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-4">

      <Card
        title="Status"
        value={rental.status}
      />

      <Card
        title="Days on Rent"
        value={daysOnRent.toString()}
      />

      <Card
        title="Remaining Days"
        value={remainingDays?.toString() ?? "Not specified"}
      />

      <Card
        title="Equipment"
        value={equipmentLabel}
      />

    </div>
  );
}
