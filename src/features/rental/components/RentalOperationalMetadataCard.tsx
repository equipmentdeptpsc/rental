import type { RentalOperationalMetadataSnapshot } from "../types";

interface Props {
  metadata?: RentalOperationalMetadataSnapshot;
  title?: string;
  costCodeMissingLabel?: string;
  activityCodeMissingLabel?: string;
  workDescription?: { code?: string; name: string };
}

export default function RentalOperationalMetadataCard({
  metadata,
  title = "Operational Metadata at Rental Creation",
  costCodeMissingLabel = "Cost Code not captured",
  activityCodeMissingLabel = "Activity Code not captured",
  workDescription,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      {metadata === undefined ? (
        <p className="text-sm text-amber-700">Operational metadata not captured for this legacy Rental</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Snapshot label="Cost Code" snapshot={metadata.costCode} missing={costCodeMissingLabel} />
          <Snapshot label="Activity Code" snapshot={metadata.activityCode} missing={activityCodeMissingLabel} />
          {workDescription && <Snapshot label="Work Description" snapshot={workDescription} missing="Work Description not captured" />}
        </div>
      )}
    </div>
  );
}

function Snapshot({ label, snapshot, missing }: {
  label: string;
  snapshot?: { code?: string; name: string };
  missing: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      {snapshot ? <>{snapshot.code && <div className="mt-1 font-medium">{snapshot.code}</div>}<div className="text-sm text-slate-500">{snapshot.name}</div></>
        : <div className="mt-1 text-sm text-amber-700">{missing}</div>}
    </div>
  );
}
