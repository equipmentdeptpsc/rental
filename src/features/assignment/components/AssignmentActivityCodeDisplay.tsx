import type { ActivityCodeRecord } from "@/features/masters/activity-code";
import { evaluateAssignmentActivityCodeConfiguration } from "../utils/assignmentActivityCode";

interface Props {
  activityCodeId?: string;
  records: ActivityCodeRecord[];
}

export default function AssignmentActivityCodeDisplay({ activityCodeId, records }: Props) {
  const configuration = evaluateAssignmentActivityCodeConfiguration(activityCodeId, records);

  if (configuration.status === "missing" || configuration.status === "not-found") {
    return <div className="mt-1 font-medium text-amber-700">{configuration.message}</div>;
  }

  const status = configuration.status === "configured"
    ? undefined
    : configuration.status === "inactive" ? "Inactive" : "Deleted";

  return (
    <div className="mt-1">
      <div className="font-medium">{configuration.record.activityCode}</div>
      <div className="text-sm text-slate-500">{configuration.record.description}</div>
      {status && (
        <span className="mt-1 inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {status}
        </span>
      )}
    </div>
  );
}
