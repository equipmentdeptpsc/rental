import AssignmentSummaryCard from "./AssignmentSummaryCard";

import AssignmentQuickActions from "./AssignmentQuickActions";

export default function AssignmentPanel() {
  return (
    <div className="space-y-6">

      <AssignmentSummaryCard />

      <AssignmentQuickActions />

    </div>
  );
}