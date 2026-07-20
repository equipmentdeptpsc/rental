import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import {
  createDeur,
  getDeurCreationError,
} from "@/features/rental/deur/services/CreateDeurService";
import { useRentalWorkspaceAggregate } from "..";
import { useState } from "react";
import { useWorkDescriptions } from "@/features/masters/work-description/context/WorkDescriptionContext";
import { getSelectableWorkDescriptions } from "@/features/masters/work-description/services/getSelectableWorkDescriptions";
import { createDeurOperationalMetadataSnapshot } from "@/features/rental/deur/services/createDeurOperationalMetadataSnapshot";
import { resolveDeurEvidenceMode } from "@/features/rental/deur/services/resolveDeurEvidenceMode";

export default function CreateDeurAction() {
  const aggregate = useRentalWorkspaceAggregate();
  const { showToast } = useToast();
  const hasActiveDeur = Boolean(aggregate.activeDeur);
  const equipment = aggregate.equipment;
  const operator = aggregate.operator;
  const { records: workDescriptions } = useWorkDescriptions();
  const options = getSelectableWorkDescriptions({ workDescriptions, equipmentCategoryId: equipment?.categoryId });
  const [workDescriptionId, setWorkDescriptionId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [startingLocation,setStartingLocation]=useState("");
  const [startingOdometer,setStartingOdometer]=useState("");
  const [quantity,setQuantity]=useState("");
  const [shift,setShift]=useState<"Day"|"Night"|"">("");
  const billingMethod=aggregate.rental.commercialSnapshot?.billingMethod ?? aggregate.rental.billingMethod ?? aggregate.contract?.billingMethod;
  const resolvedMode=resolveDeurEvidenceMode(billingMethod);
  const selectedWorkDescription = options.find((item) => item.id === workDescriptionId);
  const request = {
    rentalId: aggregate.rental.id,
    rentalStatus: aggregate.rental.status,
    equipmentId: equipment?.id ?? "",
    operatorId: operator?.id ?? "",
    assignmentId: aggregate.assignment?.id,
    projectId: aggregate.project?.id ?? aggregate.rental.projectId,
    customerId: aggregate.rental.customerId,
    rental: aggregate.rental,
    selectedWorkDescription,
    remarks,
    billingMethod,
    shift: shift || undefined,
    odometerCheckpoints: resolvedMode.supported&&resolvedMode.mode==="ODOMETER_TRIP"&&startingLocation.trim()&&Number.isFinite(Number(startingOdometer)) ? [{id:crypto.randomUUID(),location:startingLocation,odometerReading:Number(startingOdometer),recordedAt:new Date().toISOString()}] : undefined,
    quantityEvidence: resolvedMode.supported&&resolvedMode.mode==="QUANTITY" ? {quantity:Number(quantity),unit:"CUBIC_METER" as const} : undefined,
    completionEvidence: resolvedMode.supported&&resolvedMode.mode==="COMPLETION" ? {status:"IN_PROGRESS" as const} : undefined,
  } as const;
  const eligibilityError = getDeurCreationError(request);
  const metadataResult = createDeurOperationalMetadataSnapshot({ rental: aggregate.rental, selectedWorkDescription, remarks });
  const metadataError = metadataResult.issues.find((issue) => issue.code.startsWith("WORK_DESCRIPTION"))?.message;
  const evidenceError=!resolvedMode.supported?"Rental billing method is unsupported.":resolvedMode.mode==="ODOMETER_TRIP"&&(!startingLocation.trim()||!Number.isFinite(Number(startingOdometer))||Number(startingOdometer)<0)?"Starting location and odometer are required.":resolvedMode.mode==="QUANTITY"&&(!Number.isFinite(Number(quantity))||Number(quantity)<=0)?"A positive quantity is required.":undefined;

  function create() {
    const result = createDeur(request);

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }

    showToast("DEUR created successfully.", "success");
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Create DEUR</h2>
      <p className="mt-2 text-sm text-slate-500">
        {equipment ? `${equipment.assetNo} - ${equipment.equipmentName}` : "Unknown equipment"}
        {operator ? ` · ${operator.name}` : " · Operator required"}
        {aggregate.project ? ` · ${aggregate.project.projectCode} - ${aggregate.project.projectName}` : ""}
      </p>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><span className="text-slate-500">Activity Code</span><p>{aggregate.rental.operationalMetadata?.activityCode ? `${aggregate.rental.operationalMetadata.activityCode.code} — ${aggregate.rental.operationalMetadata.activityCode.name}` : "Activity Code not captured on Rental"}</p></div>
        <div><span className="text-slate-500">Cost Code</span><p>{aggregate.rental.operationalMetadata?.costCode ? `${aggregate.rental.operationalMetadata.costCode.code} — ${aggregate.rental.operationalMetadata.costCode.name}` : "Cost Code not captured on Rental"}</p></div>
        <label className="sm:col-span-2">Work Description
          <select className="mt-1 block w-full rounded border p-2" value={workDescriptionId} onChange={(event) => setWorkDescriptionId(event.target.value)}>
            <option value="">Select Work Description</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        {aggregate.rental.deurExpectationPolicy?.frequency === "PER_SHIFT" && <label>Shift
          <select className="mt-1 block w-full rounded border p-2" value={shift} onChange={(event) => setShift(event.target.value as typeof shift)}>
            <option value="">Select Shift</option>
            {aggregate.rental.deurExpectationPolicy.expectedShiftCodes?.map((code) => <option key={code} value={code === "DAY" ? "Day" : "Night"}>{code === "DAY" ? "Day" : "Night"}</option>)}
          </select>
        </label>}
        {selectedWorkDescription?.requiresRemarks && <label className="sm:col-span-2">Remarks <span className="text-amber-700">(required)</span>
          <textarea className="mt-1 block w-full rounded border p-2" value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        </label>}
        {resolvedMode.supported&&resolvedMode.mode==="ODOMETER_TRIP"&&<><label>Starting Location<input className="mt-1 block w-full rounded border p-2" value={startingLocation} onChange={e=>setStartingLocation(e.target.value)}/></label><label>Starting Odometer Reading<input className="mt-1 block w-full rounded border p-2" type="number" value={startingOdometer} onChange={e=>setStartingOdometer(e.target.value)}/></label></>}
        {resolvedMode.supported&&resolvedMode.mode==="QUANTITY"&&<label>Quantity (Cubic Meter)<input className="mt-1 block w-full rounded border p-2" type="number" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>}
        {resolvedMode.supported&&resolvedMode.mode==="COMPLETION"&&<p className="sm:col-span-2 text-slate-500">Completion evidence will begin as In Progress.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={create} disabled={Boolean(eligibilityError || metadataError || evidenceError)}>Create DEUR</Button>
        {hasActiveDeur && <span className="text-sm text-slate-500">Open the existing DEUR below to continue daily operations.</span>}
        {eligibilityError && <span className="text-sm text-slate-500">{eligibilityError}</span>}
        {!eligibilityError && metadataError && <span className="text-sm text-amber-700">{metadataError}</span>}
        {!eligibilityError&&!metadataError&&evidenceError&&<span className="text-sm text-amber-700">{evidenceError}</span>}
      </div>
    </div>
  );
}
