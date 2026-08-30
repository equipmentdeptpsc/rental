type LineageRead={status:string;rental:any|null;lines:any[];error?:string};

export function projectUatRentalResume(lineage:LineageRead, expected:{rentalId:string;rentalNumber:string;lineIds:string[];equipmentIds:string[];assignmentIds:string[];operatorIds:string[];companyId:string;customerId:string;projectId:string;workDate:string}){
  const rental=lineage.rental as any;
  const lines=Array.isArray(lineage.lines)?lineage.lines as any[]:[];
  const byId=new Map(lines.map(line=>[String(line.id),line]));
  const predicates={
    id:Boolean(rental&&String(rental.id)===expected.rentalId),
    rentalNumber:Boolean(rental&&rental.rental_number===expected.rentalNumber),
    company:Boolean(rental&&rental.company_id===expected.companyId),
    customer:Boolean(rental&&rental.customer_id===expected.customerId),
    project:Boolean(rental&&rental.project_id===expected.projectId),
    dateOut:Boolean(rental&&String(rental.date_out).slice(0,10)===expected.workDate),
    expectedReturn:Boolean(rental&&String(rental.expected_return).slice(0,10)===expected.workDate),
    lineCount:lines.length===expected.lineIds.length,
    lineIds:lines.length===expected.lineIds.length&&expected.lineIds.every(id=>byId.has(id)),
    equipment:expected.lineIds.every((id,index)=>byId.get(id)?.equipment_id===expected.equipmentIds[index]),
    assignments:expected.lineIds.every((id,index)=>byId.get(id)?.assignment_id===expected.assignmentIds[index]),
    operators:expected.lineIds.every((id,index)=>byId.get(id)?.operator_id===expected.operatorIds[index]),
    lineStatus:Boolean(rental)&&expected.lineIds.every(id=>byId.get(id)?.status===rental.status),
  };
  const exact=lineage.status==="SUCCESS"&&Boolean(rental)&&Object.values(predicates).every(Boolean);
  const status=String(rental?.status??"");
  const preparationState=status==="Reserved"?"UNKNOWN":"NOT_APPLICABLE";
  const remaining=status==="Active"?[]:status==="Released"?["activate"]:[];
  const next=status==="Active"?"NONE":status==="Released"?"command_activate_rental":status==="Reserved"?"UNKNOWN":"BLOCKED";
  return {
    id:rental?.id??null,rentalNumber:rental?.rental_number??null,status:rental?.status??null,rowVersion:rental?.row_version??null,
    companyId:rental?.company_id??null,customerId:rental?.customer_id??null,projectId:rental?.project_id??null,dateOut:rental?.date_out??null,expectedReturn:rental?.expected_return??null,
    lines:lines.map(line=>({id:line.id,status:line.status,companyId:line.company_id,equipmentId:line.equipment_id,assignmentId:line.assignment_id,operatorId:line.operator_id})),
    lineageClassification:exact?"EXACT_MATCH":"BLOCKED",reuseDecision:exact?"REUSE":"BLOCKED",createReservedRentalRequired:!exact,
    preparationState:exact?preparationState:"UNKNOWN",nextLifecycleCommand:exact?next:"BLOCKED",remainingLifecycleCommands:exact?remaining:[],
    predicates:Object.fromEntries(Object.entries(predicates).map(([key,value])=>[key,value?"PASS":"FAIL"])),
    blockers:[...(lineage.status!=="SUCCESS"?[lineage.status]:[]),...Object.entries(predicates).filter(([,value])=>!value).map(([key])=>key),...(exact&&preparationState==="UNKNOWN"?["preparationState"]:[])],
  };
}
