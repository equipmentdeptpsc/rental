import { ReportsDashboard } from "@/features/reports";
import PageHeader from "@/components/ui/PageHeader";

export default function Reports() {
  return (
    <div className="app-page">
      <PageHeader title="Reports" description="Operational, financial, and maintenance insight from canonical system data." />
      <ReportsDashboard />
    </div>
  );
}
