import type {
  DeurRecord,
} from "../types";

interface Props {
  deur: DeurRecord;
}

export default function DeurHeader({
  deur,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h1 className="text-2xl font-bold">
        Daily Equipment Utilization Report
      </h1>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        <Info
          label="Rental No."
          value={deur.rentalId}
        />

        <Info
          label="Equipment"
          value={deur.equipmentId}
        />

        <Info
          label="Operator"
          value={deur.operatorId}
        />

        <Info
          label="Project"
          value={
            deur.projectId ?? "-"
          }
        />

        <Info
          label="Work Date"
          value={deur.workDate}
        />

        <Info
          label="Shift"
          value={
            deur.shift ?? "-"
          }
        />

      </div>

    </div>
  );
}

interface InfoProps {
  label: string;
  value: string;
}

function Info({
  label,
  value,
}: InfoProps) {
  return (
    <div>

      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="font-medium">
        {value}
      </div>

    </div>
  );
}