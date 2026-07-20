import type{DeurRecord}from"../../types";
export type DeurRevisionIssueCode="REVISION_CHAIN_INVALID"|"REVISION_NUMBER_INVALID"|"REVISION_NUMBER_DUPLICATE"|"REVISION_PREVIOUS_NOT_FOUND"|"REVISION_CYCLE_DETECTED"|"REVISION_FORK_DETECTED"|"MULTIPLE_PENDING_CORRECTIONS"|"MULTIPLE_EFFECTIVE_REVISIONS";
export interface DeurRevisionResolution{valid:boolean;original?:DeurRecord;ordered:DeurRecord[];currentEffective?:DeurRecord;pendingCorrection?:DeurRecord;superseded:DeurRecord[];issues:Array<{code:DeurRevisionIssueCode;message:string}>}
const pending=(r:DeurRecord)=>["Draft","In Progress","Submitted","Pending Acknowledgement"].includes(r.status)&&Boolean(r.revision?.previousRevisionId);
export function resolveEffectiveDeurRevision(input:DeurRecord[]):DeurRevisionResolution{
 const records=structuredClone(input),issues:DeurRevisionResolution["issues"]=[];
 if(!records.length)return{valid:false,ordered:[],superseded:[],issues:[{code:"REVISION_CHAIN_INVALID",message:"Revision chain is empty."}]};
 const chainId=records.find(r=>r.revision)?.revision?.chainId??records[0].id;
 if(records.some(r=>(r.revision?.chainId??r.id)!==chainId))issues.push({code:"REVISION_CHAIN_INVALID",message:"Revision chain identifiers are inconsistent."});
 const number=(r:DeurRecord)=>r.revision?.revisionNumber??1,ordered=[...records].sort((a,b)=>number(a)-number(b)||a.id.localeCompare(b.id));
 if(ordered.some(r=>!Number.isInteger(number(r))||number(r)<1))issues.push({code:"REVISION_NUMBER_INVALID",message:"Revision numbers must be positive integers."});
 if(new Set(ordered.map(number)).size!==ordered.length)issues.push({code:"REVISION_NUMBER_DUPLICATE",message:"Revision numbers must be unique."});
 const ids=new Set(ordered.map(r=>r.id));
 ordered.forEach(r=>{if(r.revision?.previousRevisionId&&!ids.has(r.revision.previousRevisionId!))issues.push({code:"REVISION_PREVIOUS_NOT_FOUND",message:"A previous revision was not found."})});
 for(const record of ordered){const seen=new Set<string>();let current:DeurRecord|undefined=record;while(current?.revision?.previousRevisionId){if(seen.has(current.id)){issues.push({code:"REVISION_CYCLE_DETECTED",message:"Revision chain contains a cycle."});break}seen.add(current.id);current=ordered.find(r=>r.id===current!.revision!.previousRevisionId)}}
 const activeChildren=new Map<string,number>();ordered.filter(r=>r.status!=="Rejected").forEach(r=>{const p=r.revision?.previousRevisionId;if(p)activeChildren.set(p,(activeChildren.get(p)??0)+1)});if([...activeChildren.values()].some(v=>v>1))issues.push({code:"REVISION_FORK_DETECTED",message:"Revision chain contains a fork."});
 const pendingRecords=ordered.filter(pending);if(pendingRecords.length>1)issues.push({code:"MULTIPLE_PENDING_CORRECTIONS",message:"More than one correction is pending."});
 const effective=ordered.filter(r=>r.status==="Acknowledged"&&!r.revision?.supersededByRevisionId);if(effective.length>1)issues.push({code:"MULTIPLE_EFFECTIVE_REVISIONS",message:"More than one revision is effective."});
 const original=ordered.find(r=>number(r)===1),superseded=ordered.filter(r=>Boolean(r.revision?.supersededByRevisionId));
 return{valid:issues.length===0,original,currentEffective:effective[0],pendingCorrection:pendingRecords[0],ordered, superseded,issues};
}
