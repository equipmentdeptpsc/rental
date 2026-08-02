import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { prepareDeur } from "@/features/rental/deur/services/CreateDeurService";
import { evaluateOperatorDigitalDeurAccess } from "@/features/rental/deur/operator/evaluateOperatorDigitalDeurAccess";
import { resolveActiveOperatorDeur } from "@/features/rental/deur/operator/resolveActiveOperatorDeur";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";
import type { DeurOperatorAction } from "@/features/rental/deur/operator/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";
import { resolveDeurEvidenceMode } from "@/features/rental/deur/services/resolveDeurEvidenceMode";
import { calendarDateAt } from "@/features/rental/deur/expectation/dateRules";
import { getDeurMeterRequirement } from "@/features/rental/deur/services/getDeurMeterRequirement";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useOperatorDeurData } from "@/features/rental/deur/operator/useOperatorDeurData";
import { resolveOperatorDeurRouteLine, resolveOperatorDeurSelectedLineId } from "@/features/rental/deur/operator/resolveOperatorDeurRouteLine";
import {
  actionCommandType,
  AuthorizedDeurOfflineCommandExecutor,
  createDeurOperationalEvents,
  DeurOfflineCommandGateway,
  OfflineCommandReplayEngine,
  projectOfflineDeurCommand,
  type DeurOfflineCommandInput,
} from "@/features/rental/realtime";

const actionLabels: Record<DeurOperatorAction, string> = { START_OPERATION: "Start Operation", RESUME_OPERATION: "Resume Operation", START_IDLE: "Start Idle", START_STANDBY: "Start Standby", START_MEAL_BREAK: "Start Meal Break", START_BREAKDOWN: "Start Breakdown", END_ACTIVITY:"Stop Current Activity", END_SHIFT: "End Shift" };
const formatElapsed = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
export const operatorActionSuccessMessage = (action: DeurOperatorAction) =>
  action === "END_ACTIVITY" ? "End Activity saved locally." : `${actionLabels[action]} saved locally.`;

export default function OperatorDeurPage() {
  const { rentalId = "" } = useParams(); const [searchParams,setSearchParams]=useSearchParams(); const { user } = useAuth(); const { commandRepositories,changeNotifications,synchronization,authentication } = useApplicationDependenciesCompatibility(); const data=useOperatorDeurData(rentalId,user); const { rental,lines:rentalEquipmentLines,assignments,operators,equipment,projects,deurs:persistedDeurs,workDescriptions,refresh }=data;
  const operatorLines = useMemo(()=>rentalEquipmentLines.filter((line) => line.rentalId === rentalId && ["Released", "Active"].includes(line.status)),[rentalEquipmentLines,rentalId]);
  const requestedLineId=searchParams.get("lineId")??""; const [selectedLineId, setSelectedLineId] = useState("");
  useEffect(()=>{if(data.loading)return;setSelectedLineId((current)=>resolveOperatorDeurSelectedLineId(requestedLineId,current,operatorLines));},[data.loading,requestedLineId,operatorLines]);
  const routeResolution=useMemo(()=>resolveOperatorDeurRouteLine({rental,rentalId,lineId:selectedLineId,lines:operatorLines,assignments,operators,equipment,projects}),[rental,rentalId,selectedLineId,operatorLines,assignments,operators,equipment,projects]);
  const selectedLine=routeResolution.status==="RESOLVED"?routeResolution.line:undefined,assignment=routeResolution.status==="RESOLVED"?routeResolution.assignment:undefined,operator=routeResolution.status==="RESOLVED"?routeResolution.operator:undefined,machine=routeResolution.status==="RESOLVED"?routeResolution.equipment:undefined,project=routeResolution.status==="RESOLVED"?routeResolution.project:projects.find((item)=>item.id===rental?.projectId),linkedIdentity=resolveAuthenticatedOperator(user??undefined,operators);
  const [, setVersion] = useState(0), [versions,setVersions]=useState<Record<string,number>>({}), [clock, setClock] = useState(() => new Date().toISOString()), [message, setMessage] = useState(""), [remarks, setRemarks] = useState("");
  const [optimisticDeurs,setOptimisticDeurs]=useState<Array<{commandId:string;record:DeurRecord}>>([]);
  const deurs=[...persistedDeurs.filter((record)=>!optimisticDeurs.some((item)=>item.record.id===record.id)),...optimisticDeurs.map((item)=>item.record)];
  const [openingReading, setOpeningReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [shift, setShift] = useState<DeurRecord["shift"]>(() => rental?.deurExpectationPolicy?.expectedShiftCodes?.[0] === "NIGHT" ? "Night" : "Day");
  const selectable = workDescriptions.filter((item) => item.active && !item.deleted), [workDescriptionId, setWorkDescriptionId] = useState(() => selectable[0]?.id ?? "");
  useEffect(() => {
    if (!synchronization.tenantId) return;
    return synchronization.operator.subscribe(
      { tenantId: synchronization.tenantId, rentalId },
      (event) => {
        const hasActiveEdits = Boolean(
          remarks.trim() || openingReading.trim() || closingReading.trim()
          || startLocation.trim() || endLocation.trim(),
        );
        if (hasActiveEdits) {
          setMessage(`A synchronized update is available for equipment line ${event.rentalLineId}. Active edits were preserved.`);
          return;
        }
        void refresh();
        setMessage(`Equipment line ${event.rentalLineId} synchronized.`);
      },
    );
  }, [synchronization, rentalId, refresh, remarks, openingReading, closingReading, startLocation, endLocation]);
  useEffect(() => changeNotifications.subscribeDeur((record) => { if (record.rentalId === rentalId) { void refresh(); setVersion((value) => value + 1); setMessage("Latest DEUR change received."); } }), [changeNotifications,refresh,rentalId]);
  useEffect(()=>{setVersions(current=>Object.fromEntries(deurs.map(record=>[record.id,current[record.id]??Number((record as DeurRecord&{rowVersion?:number}).rowVersion??0)])));},[deurs]);
  const resolved = resolveActiveOperatorDeur({ rentalId, rentalEquipmentLineId: selectedLine?.id, equipmentId: selectedLine?.equipmentId, operatorId: operator?.id ?? "", deurs }); const active = resolved.status === "RESOLVED" ? resolved.record : undefined;
  const submitted = !active ? [...deurs].filter((record) => record.operatorId === operator?.id && (!selectedLine || record.rentalEquipmentLineId === selectedLine.id) && record.workDate === calendarDateAt(clock, rental?.deurExpectationPolicy?.timezone) && ["Submitted", "Pending Acknowledgement", "Acknowledged", "Rejected"].includes(record.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined;
  const projection = active ? projectDigitalDeurRunningState({ deur: active, evaluationTimestamp: clock }) : undefined;
  useEffect(() => { if (!projection?.valid || !projection.value.isRunning) return; const timer = window.setInterval(() => setClock(new Date().toISOString()), 1_000); return () => window.clearInterval(timer); }, [active?.id, active?.updatedAt, projection?.valid && projection.value.isRunning]);
  const access = routeResolution.status !== "RESOLVED"
    ? { allowed:false as const,allowedActions:[] as DeurOperatorAction[],issues:[{code:routeResolution.status,message:"message" in routeResolution?routeResolution.message:"Select an eligible equipment line."}]}
    : linkedIdentity.status === "RESOLVED"
    ? evaluateOperatorDigitalDeurAccess({ actor: user ?? undefined, authenticatedOperatorId: linkedIdentity.operator.id, operator: linkedIdentity.operator, assignment, rental, rentalEquipmentLine: selectedLine, deurs, evaluationTimestamp: clock, shift })
    : { allowed: false as const, allowedActions: [] as DeurOperatorAction[], issues: [{ code: linkedIdentity.status, message: "message" in linkedIdentity ? linkedIdentity.message : "Operator access requires an Operator login." }] };
  const policyCodes=rental?.deurExpectationPolicy?.expectedShiftCodes??[]; const configuredWindows=(rental?.deurShiftWindowSnapshots?.length?rental.deurShiftWindowSnapshots:deurShiftWindowRepository.getAll()).filter(item=>!policyCodes.length||policyCodes.includes(item.code)); const windowSnapshot = configuredWindows.find((item) => item.code === (shift === "Night" ? "NIGHT" : "DAY"));
  const commercialTerms = selectedLine?.commercialSnapshot ?? rental?.commercialSnapshot;
  const billingMethod = commercialTerms?.billingMethod ?? rental?.billingMethod;
  const meterRequirement = getDeurMeterRequirement({
    billingMethod,
    commercialTerms,
    equipmentMeterCapability: machine?.maintenanceType === "Engine Hours" ? "hourMeter" : ["Kilometers", "Mileage"].includes(machine?.maintenanceType ?? "") ? "odometer" : "none",
  });
  const meterReadingType = meterRequirement.kind === "odometer" ? "ODOMETER" as const : meterRequirement.kind === "hourMeter" ? "HOUR_METER" as const : undefined;
  const evidenceMode = resolveDeurEvidenceMode(billingMethod);
  const applyOfflineProjection = (command: DeurOfflineCommandInput) => {
    const deurId = "deurId" in command.input ? command.input.deurId : command.input.draft.id;
    const projected = projectOfflineDeurCommand(
      command,
      deurs.find((record) => record.id === deurId),
      { id: user?.id, name: user?.name ?? "Operator", role: user?.role },
    );
    if (projected) setOptimisticDeurs((current) => [...current.filter((item) => item.record.id !== projected.id), { commandId: command.input.commandId, record: projected }]);
  };
  const commandGateway = useMemo(() => new DeurOfflineCommandGateway(
    commandRepositories.deurCommands,
    synchronization.offlineQueue,
    synchronization.tenantId ?? "",
  ), [commandRepositories.deurCommands, synchronization.offlineQueue, synchronization.tenantId]);
  const replayEngine = useMemo(() => new OfflineCommandReplayEngine(
    synchronization.offlineQueue,
    new AuthorizedDeurOfflineCommandExecutor(commandRepositories.deurCommands, async (queued, result) => {
      if (!synchronization.publishEnabled || !synchronization.tenantId) return;
      const payload = queued.payload as Record<string, unknown>;
      const action = queued.commandType === "DEUR_START_SHIFT" ? "START_OPERATION"
        : queued.commandType === "DEUR_SUBMIT" ? "SUBMIT"
        : queued.commandType === "DEUR_COMPLETE_SHIFT" ? "END_SHIFT"
        : String(payload.action) as DeurOperatorAction;
      for (const event of createDeurOperationalEvents({
        tenantId: synchronization.tenantId,
        deur: result.record,
        action,
        serverOccurredAt: result.serverOccurredAt,
        aggregateVersion: result.version,
      })) await synchronization.operator.publish(event);
    }),
    synchronization.replayCoordinator,
    crypto.randomUUID(),
  ), [commandRepositories.deurCommands, synchronization.offlineQueue, synchronization.operator, synchronization.publishEnabled, synchronization.replayCoordinator, synchronization.tenantId]);
  const currentReplayIdentity = useCallback(async (queuedOperatorId: string, queuedAssignmentId?: string) => {
    let currentUserId = user?.id;
    let currentOperatorId = user?.operatorId;
    let authenticated = Boolean(user);
    if (authentication.remoteAuthenticationProvider) {
      const refreshed = await authentication.remoteAuthenticationProvider.refreshSession();
      currentUserId = refreshed.success ? refreshed.value?.user.id : undefined;
      currentOperatorId = refreshed.success ? refreshed.value?.user.operatorId : undefined;
      authenticated = Boolean(refreshed.success && refreshed.value);
    } else {
      const restored = authentication.authenticationService.initialize();
      currentUserId = restored.user?.id;
      currentOperatorId = restored.user?.operatorId;
      authenticated = Boolean(restored.session && restored.user);
    }
    const assignmentValid = assignments.some((item) =>
      item.id === queuedAssignmentId && item.operatorId === queuedOperatorId &&
      item.status === "Active",
    );
    return { tenantId: synchronization.tenantId ?? "", userId: currentUserId ?? "", operatorId: currentOperatorId, authenticated, assignmentValid };
  }, [assignments, authentication, synchronization.tenantId, user]);
  useEffect(() => {
    if (!synchronization.tenantId || !user?.operatorId) return;
    const replay = () => void replayEngine.replayWithValidator(
      { tenantId: synchronization.tenantId!, operatorId: user.operatorId! },
      {
        refreshAndValidate: async ({ queued }) => currentReplayIdentity(
          queued.operatorId ?? "",
          String((queued.payload as Record<string, unknown>).assignmentId ?? ""),
        ),
      },
    ).then((report) => {
      if (report?.succeeded) { setOptimisticDeurs([]); void refresh(); setMessage(`${report.succeeded} offline command${report.succeeded === 1 ? "" : "s"} synchronized.`); }
      if (report?.terminal) setMessage(`${report.terminal} offline command${report.terminal === 1 ? "" : "s"} require attention.`);
    }).then(async () => {
      const failures = await synchronization.offlineQueue.listTerminal({ tenantId: synchronization.tenantId!, operatorId: user.operatorId! });
      if (failures.length) setMessage(`${failures.length} offline command${failures.length === 1 ? "" : "s"} require operator attention.`);
    });
    window.addEventListener("online", replay);
    if (navigator.onLine) replay();
    return () => window.removeEventListener("online", replay);
  }, [currentReplayIdentity, refresh, replayEngine, synchronization.offlineQueue, synchronization.tenantId, user?.operatorId]);
  async function startDigitalDeur() {
    if (!access.allowed || !rental || !selectedLine || !assignment || !operator) return setMessage(access.issues[0]?.message ?? "Select an eligible equipment line.");
    const selected = selectable.find((item) => item.id === workDescriptionId); if (!selected) return setMessage("Select a Work Description.");
    const beginning = meterReadingType ? Number(openingReading) : undefined;
    if (meterReadingType && (!openingReading.trim() || !Number.isFinite(beginning) || beginning! < 0)) return setMessage("Enter a valid beginning meter reading.");
    if (evidenceMode.supported && evidenceMode.mode === "ODOMETER_TRIP" && !startLocation.trim()) return setMessage("Enter the beginning location.");
    const prepared = prepareDeur({ authenticatedUser: user, enforceOperatorOwnership: true, rentalId: rental.id, rentalEquipmentLineId: selectedLine.id, rentalStatus: rental.status, rental, assignmentId: selectedLine.assignmentId, equipmentId: selectedLine.equipmentId, operatorId: selectedLine.operatorId, projectId: rental.projectId, customerId: rental.customerId, selectedWorkDescription: selected, remarks, shift, openingMeter: beginning, meterReadingType, existingDeurs:deurs, odometerCheckpoints: evidenceMode.supported && evidenceMode.mode === "ODOMETER_TRIP" ? [{ id: crypto.randomUUID(), location: startLocation, odometerReading: beginning!, recordedAt: new Date().toISOString() }] : undefined, completionEvidence: evidenceMode.supported && evidenceMode.mode === "COMPLETION" ? { status: "IN_PROGRESS" } : undefined });
    if(!prepared.success)return setMessage(prepared.message);
    const commandId=crypto.randomUUID(),input={commandId,idempotencyKey:commandId,rentalId:rental.id,rentalLineId:selectedLine.id,equipmentId:selectedLine.equipmentId,operatorId:selectedLine.operatorId,assignmentId:selectedLine.assignmentId??"",clientCreatedAt:new Date().toISOString(),draft:prepared.record};
    const gatewayResult=await commandGateway.executeOrQueue({type:"DEUR_START_SHIFT",input},await currentReplayIdentity(input.operatorId,input.assignmentId));
    if(gatewayResult.disposition==="QUEUED"){applyOfflineProjection({type:"DEUR_START_SHIFT",input});setMessage("Digital DEUR start saved offline and will synchronize after reconnection.");return;}
    const result=gatewayResult.result;setMessage(result.success ? "Digital DEUR started." : result.message); if (result.success){if(synchronization.tenantId&&synchronization.publishEnabled)for(const event of createDeurOperationalEvents({tenantId:synchronization.tenantId,deur:result.record,action:"START_OPERATION",serverOccurredAt:result.serverOccurredAt,aggregateVersion:result.version}))await synchronization.operator.publish(event);setVersions(current=>({...current,[result.record.id]:result.version}));await refresh();setVersion((value) => value + 1);}
  }
  async function applyAction(action: DeurOperatorAction) {
    if (!active || !user) return; if (action === "END_SHIFT" && !window.confirm("End the current shift and close its active activity?")) return;
    const actionTimestamp = new Date().toISOString();
    if (action === "END_SHIFT" && meterReadingType) {
      const ending = Number(closingReading);
      if (!closingReading.trim() || !Number.isFinite(ending) || ending < 0) return setMessage("Enter a valid ending meter reading.");
      if (evidenceMode.supported && evidenceMode.mode === "ODOMETER_TRIP" && !endLocation.trim()) return setMessage("Enter the ending location.");
    }
    const commandId=crypto.randomUUID(),base={commandId,idempotencyKey:commandId,rentalId:active.rentalId,rentalLineId:active.rentalEquipmentLineId??"",equipmentId:active.equipmentId,operatorId:active.operatorId,assignmentId:active.assignmentId??"",deurId:active.id,expectedVersion:versions[active.id]??0,clientCreatedAt:actionTimestamp};
    const input=action==="END_SHIFT"?{...base,closingMeter:meterReadingType?Number(closingReading):undefined,closingLocation:endLocation||undefined,meterRequirement:meterRequirement.kind}:{...base,action};
    const gatewayResult=await commandGateway.executeOrQueue({type:actionCommandType(action),input} as Parameters<DeurOfflineCommandGateway["executeOrQueue"]>[0],await currentReplayIdentity(base.operatorId,base.assignmentId));
    if(gatewayResult.disposition==="QUEUED"){applyOfflineProjection({type:actionCommandType(action),input} as DeurOfflineCommandInput);setMessage(`${actionLabels[action]} saved offline and will synchronize after reconnection.`);return;}
    const result=gatewayResult.result;
    setMessage(result.success ? operatorActionSuccessMessage(action).replace(" saved locally."," saved.") : result.message);
    if (result.success){if(synchronization.tenantId&&synchronization.publishEnabled)for(const event of createDeurOperationalEvents({tenantId:synchronization.tenantId,deur:result.record,action,serverOccurredAt:result.serverOccurredAt,aggregateVersion:result.version,previousActivity:projection?.valid?projection.value.activeEventType:undefined}))await synchronization.operator.publish(event);setClock(result.serverOccurredAt);setVersions(current=>({...current,[result.record.id]:result.version}));await refresh();}
    setVersion((value) => value + 1);
  }
  async function submit() { if (!active || !user || !window.confirm("Submit this DEUR for acknowledgement? It will no longer be editable.")) return; const commandId=crypto.randomUUID(),input={commandId,idempotencyKey:commandId,rentalId:active.rentalId,rentalLineId:active.rentalEquipmentLineId??"",equipmentId:active.equipmentId,operatorId:active.operatorId,assignmentId:active.assignmentId??"",deurId:active.id,expectedVersion:versions[active.id]??0,clientCreatedAt:new Date().toISOString()};const gatewayResult=await commandGateway.executeOrQueue({type:"DEUR_SUBMIT",input},await currentReplayIdentity(input.operatorId,input.assignmentId));if(gatewayResult.disposition==="QUEUED"){applyOfflineProjection({type:"DEUR_SUBMIT",input});setMessage("DEUR submission saved offline and will synchronize after reconnection.");return;}const result=gatewayResult.result; setMessage(result.success ? "DEUR submitted." : result.message);if(result.success){if(synchronization.tenantId&&synchronization.publishEnabled)for(const event of createDeurOperationalEvents({tenantId:synchronization.tenantId,deur:result.record,action:"SUBMIT",serverOccurredAt:result.serverOccurredAt,aggregateVersion:result.version}))await synchronization.operator.publish(event);setVersions(current=>({...current,[result.record.id]:result.version}));await refresh();} setVersion((value) => value + 1); }
  if (!rental) return <main className="p-6">Rental not found.</main>;
  if (rental.status === "Closed") return <main className="p-6"><Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><p className="mt-4 rounded bg-slate-100 p-4">This Rental has been closed. Historical records are read-only.</p></main>;
  return <main className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-2xl font-bold">Operator Digital DEUR</h1><p className="text-sm text-slate-600">Confirmed changes refresh the current shift view.</p></header>
    {operatorLines.length > 1 && <label className="block rounded-xl border bg-white p-4 text-sm">Equipment Line<select className="mt-2 w-full rounded border p-3" value={selectedLineId} onChange={(event) => {const value=event.target.value;setSelectedLineId(value);setSearchParams(value?{lineId:value}:{},{replace:true});}}><option value="">Select equipment</option>{operatorLines.map((line,index) => { const item = equipment.find((machine) => machine.id === line.equipmentId); return <option key={line.id} value={line.id}>{item ? `${item.equipmentName} (${item.assetNo}) / Rental Line ${index+1}` : `Rental Line ${index+1}`}</option>; })}</select></label>}
    <section className="grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 text-sm"><p><span className="block text-slate-500">Rental</span>{rental.rentalNumber ?? "Number unavailable"}</p><p><span className="block text-slate-500">Equipment</span>{machine ? `${machine.equipmentName} (${machine.assetNo})` : "Select a line"}</p><p><span className="block text-slate-500">Project</span>{project?.projectName ?? rental.project}</p><p><span className="block text-slate-500">Operator</span>{operator?.name ?? "Operator not assigned"}</p><p><span className="block text-slate-500">Line</span>{selectedLine?`${machine?.equipmentName??"Equipment"} / Rental Line ${operatorLines.findIndex(line=>line.id===selectedLine.id)+1}`:"Not selected"}</p><p><span className="block text-slate-500">Work Date</span>{active?.workDate ?? new Date().toISOString().slice(0, 10)}</p><p><span className="block text-slate-500">Shift Window</span>{windowSnapshot ? `${windowSnapshot.label} ${windowSnapshot.startTime}–${windowSnapshot.endTime}${windowSnapshot.endTime <= windowSnapshot.startTime ? " next day" : ""}` : "DEUR Shift Window is not configured."}</p></section>
    {!active && !submitted && meterReadingType && <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"><label className="text-sm">Beginning {meterReadingType === "HOUR_METER" ? "hour meter" : "odometer"}<input className="mt-1 min-h-12 w-full rounded border p-3" inputMode="decimal" value={openingReading} onChange={(event) => setOpeningReading(event.target.value)} /></label>{evidenceMode.supported && evidenceMode.mode === "ODOMETER_TRIP" && <label className="text-sm">Beginning location<input className="mt-1 min-h-12 w-full rounded border p-3" value={startLocation} onChange={(event) => setStartLocation(event.target.value)} /></label>}</section>}
    {!active && !submitted && <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">Start Digital DEUR</h2><label className="block text-sm">Shift<select className="mt-1 min-h-12 w-full rounded border p-3" value={shift} onChange={(event) => setShift(event.target.value as DeurRecord["shift"])}>{configuredWindows.map((item) => <option key={item.code} value={item.code === "DAY" ? "Day" : "Night"}>{item.label}</option>)}</select></label><label className="block text-sm">Work Description<select className="mt-1 min-h-12 w-full rounded border p-3" value={workDescriptionId} onChange={(event) => setWorkDescriptionId(event.target.value)}>{selectable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm">Remarks<textarea className="mt-1 w-full rounded border p-3" value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><button className="min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:bg-slate-400" disabled={!access.allowed || resolved.status === "AMBIGUOUS"||!windowSnapshot} onClick={startDigitalDeur}>Start Digital DEUR</button></section>}
    {active && meterReadingType && !active.events?.some((event) => event.activityType === "shift" && event.action === "end") && <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"><label className="text-sm">Ending {meterReadingType === "HOUR_METER" ? "hour meter" : "odometer"}<input className="mt-1 min-h-12 w-full rounded border p-3" inputMode="decimal" value={closingReading} onChange={(event) => setClosingReading(event.target.value)} /></label>{evidenceMode.supported && evidenceMode.mode === "ODOMETER_TRIP" && <label className="text-sm">Ending location<input className="mt-1 min-h-12 w-full rounded border p-3" value={endLocation} onChange={(event) => setEndLocation(event.target.value)} /></label>}</section>}
    {active && projection?.valid && <section className="sticky top-2 z-10 grid grid-cols-2 gap-3 rounded-xl bg-slate-950 p-4 text-white sm:grid-cols-4"><div><p className="text-xs text-slate-300">Operation</p><strong>{(projection.value.projectedOperationMinutes / 60).toFixed(2)} h</strong></div><div><p className="text-xs text-slate-300">Idle</p><strong>{(projection.value.projectedIdleMinutes / 60).toFixed(2)} h</strong></div><div><p className="text-xs text-slate-300">Standby</p><strong>{(projection.value.projectedMealBreakMinutes / 60).toFixed(2)} h</strong></div><div><p className="text-xs text-slate-300">Breakdown</p><strong>{(projection.value.projectedBreakdownMinutes / 60).toFixed(2)} h</strong></div></section>}
    {active && <section className="space-y-4 rounded-xl border bg-white p-4"><div><span className="text-sm text-slate-500">Current Activity</span><p className="text-xl font-semibold">{projection?.valid ? projection.value.activeEventType ?? "Ready" : "Unavailable"}</p></div><div className="grid grid-cols-2 gap-3"><p><span className="block text-sm text-slate-500">Elapsed</span><strong className="text-2xl tabular-nums">{projection?.valid ? formatElapsed(projection.value.activeEventElapsedSeconds) : "00:00:00"}</strong></p><p><span className="block text-sm text-slate-500">Live / Projected Operation</span><strong>{projection?.valid ? (projection.value.projectedOperationMinutes / 60).toFixed(2) : "0.00"} hours</strong></p></div><div className="grid gap-3 sm:grid-cols-2">{access.allowedActions.map((action) => <button key={action} className={`min-h-12 rounded-lg px-4 py-3 font-semibold ${action === "END_SHIFT" ? "border border-red-500 text-red-700" : "bg-blue-700 text-white"}`} onClick={() => applyAction(action)}>{actionLabels[action]}</button>)}</div>{active.events?.some((event) => event.activityType === "shift" && event.action === "end") && <button className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white" onClick={submit}>Submit DEUR</button>}</section>}
    {submitted && <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Submitted DEUR</h2><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">DEUR</dt><dd>{submitted.deurNumber ?? submitted.id}</dd></div><div><dt className="text-slate-500">Status</dt><dd>{submitted.status}</dd></div><div><dt className="text-slate-500">Submitted</dt><dd>{submitted.submittedAt ? new Date(submitted.submittedAt).toLocaleString() : "Pending"}</dd></div><div><dt className="text-slate-500">Customer review</dt><dd>{submitted.status === "Acknowledged" ? "Acknowledged" : submitted.status === "Rejected" ? "Correction requested" : "Awaiting acknowledgement"}</dd></div></dl><p className="text-sm">Operation {(submitted.totalOperatingMinutes / 60).toFixed(2)} h · Idle {(submitted.totalIdleMinutes / 60).toFixed(2)} h · Standby {(submitted.totalMealBreakMinutes / 60).toFixed(2)} h · Breakdown {(submitted.totalMaintenanceMinutes / 60).toFixed(2)} h</p></section>}
    {(!access.allowed || message) && <p role="status" className={`rounded-lg p-3 text-sm ${access.allowed ? "bg-blue-50 text-blue-900" : "bg-red-50 text-red-800"}`}>{message || access.issues[0]?.message}</p>}
    <p className="text-xs text-slate-500">Local changes saved. Timer display is reconstructed from persisted event timestamps; timer ticks are never stored.</p>
  </main>;
}
