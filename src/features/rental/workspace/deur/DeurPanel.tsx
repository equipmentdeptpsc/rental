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
  import DeurOperationalMetadataCard from "@/features/rental/deur/components/DeurOperationalMetadataCard";
  import ManualDeurAction from "./ManualDeurAction";
  import DeurEvidencePanel from "./DeurEvidencePanel";
  import ManualOdometerDeurAction from "./ManualOdometerDeurAction";
  import SubmitEvidenceButton from "./SubmitEvidenceButton";
  import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";
  import CreateDeurCorrectionAction from "./CreateDeurCorrectionAction";
  import DeurRevisionCard from "@/features/rental/deur/components/DeurRevisionCard";
  import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";
  import { Link } from "react-router-dom";
  import { useEquipment } from "@/features/equipment/context/EquipmentContext";
  import { useOperator } from "@/features/operators/context/OperatorContext";
  import { resolveDeurPresentation } from "@/features/rental/deur/presentation/resolveDeurPresentation";
  import { useCustomer } from "@/features/customer/context/CustomerContext";
  import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
  import { useAuth } from "@/features/auth/AuthContext";
  import { rentalAuditRepository } from "@/features/rental/audit/rentalAuditRepository";
  import RentalLineOperationsGrid from "./RentalLineOperationsGrid";
  
  export default function DeurPanel() {
    const aggregate = useRentalWorkspaceAggregate();
    const {equipment}=useEquipment(); const {operators}=useOperator(); const {customers}=useCustomer(); const {user}=useAuth(); const [reviewMessage,setReviewMessage]=useState("");
    const summary =
      useDailyOperations();

    const activities =
      useTodayActivities();

    const previewRecord = aggregate.activeDeur ?? aggregate.deurs.at(-1);
    const timelineMode=!previewRecord?.evidenceMode||previewRecord.evidenceMode==="TIME_TIMELINE";
    const presentation=previewRecord?resolveDeurPresentation({deur:previewRecord,lines:aggregate.rentalEquipmentLines,equipment,operators}):undefined;
    const sendReview=()=>{
      if(!previewRecord||!presentation||previewRecord.status!=="Submitted")return setReviewMessage("Only the effective Submitted DEUR revision can be sent for acknowledgement.");
      const revisionNumber=previewRecord.revision?.revisionNumber??1;
      const existing=developmentCustomerReviewOutbox.getAll().find(item=>item.deurId===previewRecord.id&&item.revisionNumber===revisionNumber&&item.status==="Pending");
      if(existing)return setReviewMessage(`An acknowledgement request is already pending for ${existing.deurNumber} R${existing.revisionNumber}.`);
      const customer=customers.find(item=>item.id===aggregate.rental.customerId),contact=aggregate.rental.customerContactSnapshot??(customer?{representativeName:customer.contactPerson,representativeEmail:customer.email}:undefined);
      if(!contact?.representativeName?.trim())return setReviewMessage("A Customer representative name is required.");
      if(!contact.representativeEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.representativeEmail))return setReviewMessage("A valid Customer representative email is required.");
      try{
        const entry=developmentCustomerReviewOutbox.create({deurId:previewRecord.id,deurNumber:previewRecord.deurNumber??"Number unavailable",revisionNumber,rentalNumber:aggregate.rental.rentalNumber??"Number unavailable",customerName:customer?.companyName??aggregate.rental.customer,representativeName:contact.representativeName,representativeEmail:contact.representativeEmail,snapshot:{project:aggregate.project?.projectName??aggregate.rental.project,equipment:presentation.equipment,operator:presentation.operator,workDate:previewRecord.workDate,shift:previewRecord.shift,workDescription:previewRecord.operationalMetadata?.workDescription?.name,remarks:previewRecord.operationalRemarks,submittedAt:previewRecord.submittedAt,operationMinutes:previewRecord.totals?.operationMinutes??previewRecord.totalOperatingMinutes,idleMinutes:previewRecord.totals?.idleMinutes??previewRecord.totalIdleMinutes,breakdownMinutes:previewRecord.totals?.breakdownMinutes??previewRecord.totalMaintenanceMinutes,origin:previewRecord.creationSource??"Legacy"}});
        rentalAuditRepository.append({id:crypto.randomUUID(),rentalId:aggregate.rental.id,rentalNumber:aggregate.rental.rentalNumber,action:"CUSTOMER_REVIEW_REQUESTED",timestamp:new Date().toISOString(),actorId:user?.id,actorName:user?.name,actorRole:user?.role,previousApprovalStatus:aggregate.rental.approvalStatus??"LegacyNotRecorded",resultingApprovalStatus:aggregate.rental.approvalStatus??"LegacyNotRecorded",previousRentalStatus:aggregate.rental.status,resultingRentalStatus:aggregate.rental.status,remarks:`${previewRecord.deurNumber??"DEUR"} R${revisionNumber} sent to ${entry.representativeEmail}.`});
        setReviewMessage(`Awaiting Customer Acknowledgement. Request sent to ${entry.representativeEmail}.`);
      }catch(error){setReviewMessage(error instanceof Error?error.message:"Unable to create Customer review request.")}
    };
    const running = previewRecord
      ? deriveDeurEventState(previewRecord).hasOpenInterval || previewRecord.logs.some((log) => !log.endTime)
      : false;
    const [evaluatedAt, setEvaluatedAt] = useState(() => new Date());
    const liveProjection = previewRecord?.creationSource === "OPERATOR_DIGITAL" ? projectDigitalDeurRunningState({ deur: previewRecord, evaluationTimestamp: evaluatedAt.toISOString() }) : undefined;

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
        revisionChain: aggregate.deurs.filter((item) =>
          (item.revision?.chainId ?? item.id) === (previewRecord.revision?.chainId ?? previewRecord.id)
        ),
      });
    }, [previewRecord, aggregate.contract, aggregate.deurs, evaluatedAt]);

    if (aggregate.rentalEquipmentLines.length > 1) {
      return <div className="space-y-6">
        <RentalLineOperationsGrid aggregate={aggregate} equipment={equipment} operators={operators} evaluatedAt={evaluatedAt.toISOString()} />
        <CreateDeurAction />
        <ManualDeurAction />
        <ManualOdometerDeurAction />
        <p className="rounded border bg-slate-50 p-3 text-sm text-slate-600">Open a specific Equipment Line to continue its DEUR, customer-review, correction, and submission workflow. No combined Rental-level DEUR is selected.</p>
      </div>;
    }
  
    return (
      <div className="space-y-6">
        <RentalLineOperationsGrid aggregate={aggregate} equipment={equipment} operators={operators} evaluatedAt={evaluatedAt.toISOString()} />

        <div className="rounded-xl border bg-blue-50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Operator Digital DEUR</p><p className="text-xs text-slate-600">Local real-time sync across this browser’s open tabs and windows.</p></div><Link className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white" to={`/rentals/${aggregate.rental.id}/operator-deur${previewRecord?.rentalEquipmentLineId?`?lineId=${encodeURIComponent(previewRecord.rentalEquipmentLineId)}`:""}`}>Open Operator View</Link></div>
          {previewRecord?.creationSource === "OPERATOR_DIGITAL" && liveProjection?.valid && <div className="mt-3 grid gap-2 sm:grid-cols-3"><p><span className="block text-slate-500">Digital DEUR</span>{liveProjection.value.isRunning ? `Running — ${liveProjection.value.activeEventType}` : previewRecord.status}</p><p><span className="block text-slate-500">Live / Projected Operation</span>{(liveProjection.value.projectedOperationMinutes / 60).toFixed(2)} hours</p><p><span className="block text-slate-500">Last Updated</span>{new Date(previewRecord.updatedAt).toLocaleString()}</p></div>}
        </div>

        {previewRecord && presentation && <p className="rounded border bg-white p-3 text-xs text-slate-600">Equipment: {presentation.equipment} · Line: {presentation.line} · Operator: {presentation.operator} · DEUR: {previewRecord.deurNumber ?? "Number unavailable"} · Work Date: {previewRecord.workDate}{previewRecord.shift ? ` · ${previewRecord.shift}` : ""} · Status: {previewRecord.status}</p>}
        <CreateDeurAction />
        <ManualDeurAction />
        <ManualOdometerDeurAction />
        {previewRecord && <CreateDeurCorrectionAction deur={previewRecord} />}
        {previewRecord?.status === "Submitted" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-semibold">Awaiting Customer review</p><p className="text-sm text-amber-900">A Customer acknowledgement is required before Billing.</p>{!developmentCustomerReviewOutbox.getAll().some(item=>item.deurId===previewRecord.id&&item.revisionNumber===(previewRecord.revision?.revisionNumber??1))&&<button className="mt-3 rounded bg-amber-700 px-4 py-2 font-medium text-white" onClick={sendReview}>Generate Missing Acknowledgement Request</button>}{reviewMessage&&<p className="mt-2 text-sm">{reviewMessage}</p>}</div>}
  
        {timelineMode && <OperationSummaryCard
          operatingHours={
            summary.operatingHours
          }
          idleHours={
            summary.idleHours
          }
        />}
  
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

        {previewRecord && <DeurOperationalMetadataCard metadata={previewRecord.operationalMetadata} remarks={previewRecord.operationalRemarks} creationSource={previewRecord.creationSource} manualMetadata={previewRecord.manualMetadata} totals={previewRecord.totals} />}
        {previewRecord && <CommercialSnapshotCard snapshot={previewRecord.commercialSnapshot} required={previewRecord.commercialSnapshotRequired} scope="DEUR" />}
        {previewRecord && <DeurRevisionCard deur={previewRecord} chain={aggregate.deurs.filter((item) => (item.revision?.chainId ?? item.id) === (previewRecord.revision?.chainId ?? previewRecord.id))} />}

        {previewRecord && timelineMode && (
          <CurrentActivityCard
            logs={previewRecord.logs}
            workDate={previewRecord.workDate}
            evaluatedAt={evaluatedAt}
          />
        )}

        {previewRecord && (
          <BillingPreviewPanel preview={billingPreview} currency={aggregate.contract?.currency ?? "PHP"} identity={presentation?{equipment:presentation.equipment,operator:presentation.operator,line:presentation.line,deur:`${previewRecord.deurNumber??"DEUR number unavailable"} R${previewRecord.revision?.revisionNumber??1}`,statement:previewRecord.billingStatementId}:undefined} />
        )}

        {previewRecord&&!timelineMode&&<DeurEvidencePanel deur={previewRecord}/>}
        {previewRecord&&!timelineMode&&<SubmitEvidenceButton deur={previewRecord}/>}
        {timelineMode&&<DeurHoursEntry />}

        {timelineMode&&<ActivityControls />}

        {timelineMode&&<ActivityTimelineCard
          activities={activities}
        />}
  
      </div>
    );
  }
