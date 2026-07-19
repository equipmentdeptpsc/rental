import {
    useDailyOperations,
  } from "./useDailyOperations";
  
  import OperationSummaryCard from "./OperationSummaryCard";
  
  import StatusCard from "./StatusCard";
  
  import ActivityCard from "./ActivityCard";
  import CreateDeurAction from "./CreateDeurAction";
  import ActivityControls from "./controls/ActivityControls";
  import ActivityTimelineCard from "./cards/ActivityTimelineCard";
  import useTodayActivities from "./hooks/useTodayActivities";
  import DeurHoursEntry from "./DeurHoursEntry";
  import CurrentActivityCard from "@/features/rental/deur/components/CurrentActivityCard";
  import { useEffect, useMemo, useState } from "react";
  import { useRentalWorkspaceAggregate } from "..";
  import { mapRentalContractToBillingCalculationTerms } from "@/features/rental/billing/engine";
  import { createDeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
  import { deriveDeurEventState } from "@/features/rental/deur/services/deriveDeurEventState";
  import BillingPreviewPanel from "./BillingPreviewPanel";
  
  export default function DeurPanel() {
    const aggregate = useRentalWorkspaceAggregate();
    const summary =
      useDailyOperations();

    const activities =
      useTodayActivities();

    const previewRecord = aggregate.activeDeur ?? aggregate.deurs.at(-1);
    const running = previewRecord
      ? deriveDeurEventState(previewRecord).hasOpenInterval || previewRecord.logs.some((log) => !log.endTime)
      : false;
    const [evaluatedAt, setEvaluatedAt] = useState(() => new Date());

    useEffect(() => {
      setEvaluatedAt(new Date());
      if (!running) return;
      const timer = window.setInterval(() => setEvaluatedAt(new Date()), 1_000);
      return () => window.clearInterval(timer);
    }, [previewRecord?.id, running]);

    const billingPreview = useMemo(() => {
      if (!previewRecord || !aggregate.contract) return undefined;
      return createDeurBillingPreview({
        deur: previewRecord,
        terms: mapRentalContractToBillingCalculationTerms(aggregate.contract),
        evaluatedAt,
      });
    }, [previewRecord, aggregate.contract, evaluatedAt]);
  
    return (
      <div className="space-y-6">

        <CreateDeurAction />
  
        <OperationSummaryCard
          operatingHours={
            summary.operatingHours
          }
          idleHours={
            summary.idleHours
          }
        />
  
        <StatusCard
          status={
            summary.latestRecord?.status
          }
        />
  
        <ActivityCard
          remarks={
            summary.remarks
          }
        />

        {previewRecord && (
          <CurrentActivityCard
            logs={previewRecord.logs}
            workDate={previewRecord.workDate}
            evaluatedAt={evaluatedAt}
          />
        )}

        {previewRecord && (
          <BillingPreviewPanel preview={billingPreview} currency={aggregate.contract?.currency ?? "PHP"} />
        )}

        <DeurHoursEntry />

        <ActivityControls />

        <ActivityTimelineCard
          activities={activities}
        />
  
      </div>
    );
  }
