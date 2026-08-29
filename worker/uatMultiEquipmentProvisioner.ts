import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type SafeResult={status:number;body:Record<string,unknown>};
const safe=(status:number,body:Record<string,unknown>):SafeResult=>({status,body});
const scenarioKey="MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29",profile="UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1",workDate="2026-08-29";
const bad=(code:string)=>safe(409,{success:false,code});
async function persistDiagnostic(service:any,companyId:string,actorId:string,scenarioKey:string,phase:string,commandName:string,resultCode:string){
 try{await service.schema("erp").rpc("record_isolated_uat_provisioning_diagnostic",{command:{companyId,actorId,scenarioKey,diagnostic:{phase,command:commandName,resultCode,success:false,actorPresent:true,tenantMatch:true}}});}catch{/* diagnostics must never alter the public failure */}
}

type Scenario={customerId:string;projectId:string;workDescriptionId:string;operatorIds:string[];equipmentIds:string[];assignmentIds:string[];rentalAId:string;rentalBId:string;rentalALineIds:string[];rentalBLineId:string;costCodeId:string;activityCodeId:string;createCustomer:boolean;createProject:boolean;createWorkDescription:boolean};
const uuid=()=>randomUUID();
const command=(id:string,action:string)=>({commandId:`UAT-ME-${action}-${id}`,idempotencyKey:`uat-multi-equipment:${action}:${id}`});

async function rpc(client:any,name:string,payload:Record<string,unknown>):Promise<Record<string,unknown>>{
 const result=await client.schema("erp").rpc(name,payload);const value=result.data as Record<string,unknown>|null;
 if(result.error||!value?.success){const code=typeof value?.code==="string"?value.code:(result.error?"RPC_FAILED":"CANONICAL_COMMAND_FAILED");throw new Error(`${name}::${code}`);}return value;
}

export async function provisionUatMultiEquipmentCertification(request:Request,environment:GroupedReviewWorkerEnvironment):Promise<SafeResult>{
 if(environment.ENABLE_UAT_SYNTHETIC_PROVISIONER!=="true"||!environment.SUPABASE_URL||!environment.SUPABASE_SERVICE_ROLE_KEY||!environment.SUPABASE_PUBLISHABLE_KEY)return safe(503,{success:false,code:"UAT_PROVISIONER_DISABLED"});
 const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const service=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const identity=await service.auth.getUser(token);if(identity.error||!identity.data.user)return safe(401,{success:false,code:"UNAUTHENTICATED"});
 const actorId=identity.data.user.id;
 const [permission,administrator,userRecord]=await Promise.all([
  service.schema("erp").from("effective_user_permissions").select("permission_code").eq("user_id",actorId).eq("permission_code","settings.update").maybeSingle(),
  service.schema("erp").from("user_roles").select("role_id,app_roles!inner(code,active,deprecated_at)").eq("user_id",actorId).eq("app_roles.code","system-administrator").eq("app_roles.active",true).is("app_roles.deprecated_at",null).maybeSingle(),
  service.schema("erp").from("users").select("company_id").eq("id",actorId).eq("status","active").maybeSingle()
 ]);
 if(permission.error||!permission.data||administrator.error||!administrator.data)return safe(403,{success:false,code:"FORBIDDEN"});
 if(userRecord.error||!userRecord.data)return safe(403,{success:false,code:"UAT_TENANT_REQUIRED"});
 const companyId=userRecord.data.company_id;
  const tenantMeta=await service.schema("erp").rpc("get_isolated_uat_tenant_metadata",{target_tenant:companyId});
  const company={error:tenantMeta.error,data:tenantMeta.data?.[0]??null};
  // Canonical tenant RPC enforces: environment_class","compatibility.
  if(company.error||!company.data||((company.data as Record<string,unknown>).environment_class!==undefined&&(company.data as Record<string,unknown>).environment_class!=="compatibility"))return safe(403,{success:false,code:"UAT_TENANT_REQUIRED"});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||Object.keys(body).some(key=>key!=="scenarioKey"&&key!=="profile")||body.scenarioKey!==scenarioKey||(body.profile!==undefined&&body.profile!==profile))return safe(400,{success:false,code:"VALIDATION_REJECTED"});
 const begun=await service.schema("erp").rpc("begin_isolated_uat_provisioning_attempt",{command:{companyId,actorId,scenarioKey,profileVersion:profile}}); if(begun.error||!begun.data?.success)return safe(409,{success:false,code:begun.data?.code??"UAT_EXECUTION_ATTEMPT_UNAVAILABLE"}); const attemptId=begun.data.attemptId as string;
 const preDraft:any={customerId:uuid(),projectId:uuid(),workDescriptionId:uuid(),operatorIds:[uuid(),uuid(),uuid()],equipmentIds:[uuid(),uuid(),uuid()],assignmentIds:[uuid(),uuid(),uuid()],rentalAId:uuid(),rentalBId:uuid(),rentalALineIds:[uuid(),uuid()],rentalBLineId:uuid(),costCodeId:"",activityCodeId:"",createCustomer:true,createProject:true,createWorkDescription:true};
 const preClaim=await rpc(service,"claim_isolated_uat_multi_equipment_provisioning",{command:{companyId,actorId,scenarioKey,profileVersion:profile,scenario:preDraft}}).catch(async error=>{const raw=error instanceof Error?error.message:"SCENARIO_CLAIM_FAILED";const [cmd,code]=raw.split("::");await persistDiagnostic(service,companyId,actorId,scenarioKey,"RESIDUE_CLAIM_OR_REUSE",cmd||"claim_isolated_uat_multi_equipment_provisioning",code||"SCENARIO_CLAIM_FAILED");return {success:false,code:raw};});
 if(!preClaim.success){await service.schema("erp").rpc("finish_isolated_uat_provisioning_attempt",{command:{attemptId,actorId,state:"FAILED",safeResultCode:String(preClaim.code||"SCENARIO_CLAIM_FAILED")}});return bad(String(preClaim.code));}
 const reread=await rpc(service,"read_isolated_uat_multi_equipment_residue",{command:{companyId,actorId,scenarioKey}}).catch(async error=>{const raw=error instanceof Error?error.message:"RESIDUE_READ_FAILED";const [cmd,code]=raw.split("::");await persistDiagnostic(service,companyId,actorId,scenarioKey,"RESIDUE_READ",cmd||"read_isolated_uat_multi_equipment_residue",code||"RESIDUE_READ_FAILED");throw error;});
 const claimedScenario=(reread.scenario??(preClaim as Record<string,unknown>).scenario) as Scenario;
 if(!claimedScenario||!Array.isArray(claimedScenario.equipmentIds)||claimedScenario.equipmentIds.length!==3){await persistDiagnostic(service,companyId,actorId,scenarioKey,"RESIDUE_IDENTITY_VALIDATION","read_isolated_uat_multi_equipment_residue","SCENARIO_INCONSISTENT");await service.schema("erp").rpc("finish_isolated_uat_provisioning_attempt",{command:{attemptId,actorId,state:"FAILED",safeResultCode:"SCENARIO_INCONSISTENT"}});return bad("SCENARIO_INCONSISTENT");}
 const refs=await rpc(service,"resolve_isolated_uat_multi_equipment_references",{command:{companyId,scenarioKey,profileVersion:profile}}).catch(async error=>{const raw=error instanceof Error?error.message:"REFERENCE_RESOLVE_FAILED";const [cmd,code]=raw.split("::");await persistDiagnostic(service,companyId,actorId,scenarioKey,"REFERENCE_RESOLUTION",cmd||"resolve_isolated_uat_multi_equipment_references",code||"REFERENCE_RESOLVE_FAILED");await service.schema("erp").rpc("finish_isolated_uat_provisioning_attempt",{command:{attemptId,actorId,state:"FAILED",safeResultCode:code||"REFERENCE_RESOLVE_FAILED"}});throw error;});
 const draft:Scenario={...claimedScenario,costCodeId:claimedScenario.costCodeId||String(refs.costCodeId||""),activityCodeId:claimedScenario.activityCodeId||String(refs.activityCodeId||"")};
 if(!draft.costCodeId||!draft.activityCodeId){await persistDiagnostic(service,companyId,actorId,scenarioKey,"REFERENCE_VALIDATION","resolve_isolated_uat_multi_equipment_references","UAT_REFERENCE_UNAVAILABLE");return bad(String(refs.code||"UAT_REFERENCE_UNAVAILABLE"));}
 await rpc(service,"update_isolated_uat_multi_equipment_references",{command:{companyId,actorId,scenarioKey,references:{customerId:draft.customerId,projectId:draft.projectId,workDescriptionId:draft.workDescriptionId,costCodeId:draft.costCodeId,activityCodeId:draft.activityCodeId}}}).catch(async error=>{const raw=error instanceof Error?error.message:"REFERENCE_PERSIST_FAILED";const [cmd,code]=raw.split("::");await persistDiagnostic(service,companyId,actorId,scenarioKey,"REFERENCE_PERSIST",cmd||"update_isolated_uat_multi_equipment_references",code||"REFERENCE_PERSIST_FAILED");throw error;});
 const persisted=await rpc(service,"read_isolated_uat_multi_equipment_residue",{command:{companyId,actorId,scenarioKey}}).catch(async error=>{const raw=error instanceof Error?error.message:"RESIDUE_REREAD_FAILED";const [cmd,code]=raw.split("::");await persistDiagnostic(service,companyId,actorId,scenarioKey,"RESIDUE_REREAD",cmd||"read_isolated_uat_multi_equipment_residue",code||"RESIDUE_REREAD_FAILED");throw error;});
 const scenario=persisted.scenario as Scenario;
 if(!scenario||!Array.isArray(scenario.equipmentIds)||scenario.equipmentIds.length!==3){await persistDiagnostic(service,companyId,actorId,scenarioKey,"REFERENCE_VALIDATION","read_isolated_uat_multi_equipment_residue","SCENARIO_INCONSISTENT");return bad("SCENARIO_INCONSISTENT");}
 if(reread.state==="READY")return safe(200,{success:true,result:"REUSED",scenario:projection(scenario)});
 const user=createClient(environment.SUPABASE_URL,environment.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 try{
  if(scenario.createCustomer)await rpc(user,"command_create_customer",{command:{...command(scenario.customerId,"CUSTOMER"),customerId:scenario.customerId,customerCode:"UAT-ME-CERT-20260829",name:"Synthetic UAT Multi-Equipment Customer"}});
  if(scenario.createProject)await rpc(user,"command_create_project",{command:{...command(scenario.projectId,"PROJECT"),projectId:scenario.projectId,projectCode:"UAT-ME-CERT-20260829",name:"Synthetic UAT Multi-Equipment Project",customerId:scenario.customerId,location:"Isolated UAT"}});
  if(scenario.createWorkDescription)await rpc(user,"command_create_work_description",{command:{...command(scenario.workDescriptionId,"WORK"),workDescriptionId:scenario.workDescriptionId,code:"UAT-ME-RUNTIME-CERT",name:"Synthetic isolated-UAT multi-equipment runtime certification.",requiresRemarks:false,sortOrder:999}});
  for(let i=0;i<3;i++)await rpc(user,"command_create_operator",{command:{...command(scenario.operatorIds[i],`OPERATOR-${i+1}`),operatorId:scenario.operatorIds[i],name:`Synthetic UAT Multi-Equipment Operator ${i+1}`,certificationType:"Heavy Machinery",joinedDate:workDate}});
  for(let i=0;i<3;i++)await rpc(user,"command_create_equipment",{command:{...command(scenario.equipmentIds[i],`EQUIPMENT-${i+1}`),equipmentId:scenario.equipmentIds[i],assetNo:`UAT-ME-20260829-${i+1}`,equipmentName:`Synthetic UAT Multi-Equipment ${i+1}`,maintenanceType:"Engine Hours",costCodeId:scenario.costCodeId,currentReading:0,remarks:"Synthetic isolated-UAT certification equipment."}});
  for(let i=0;i<3;i++)await rpc(user,"command_create_assignment",{command:{...command(scenario.assignmentIds[i],`ASSIGNMENT-${i+1}`),assignmentId:scenario.assignmentIds[i],equipmentId:scenario.equipmentIds[i],operatorId:scenario.operatorIds[i],projectId:scenario.projectId,activityCodeId:scenario.activityCodeId,assignedDate:workDate,expectedReturn:workDate,remarks:"Synthetic isolated-UAT certification assignment."}});
  await reservePrepareReleaseActivate(user,scenario,"A",scenario.rentalAId,scenario.rentalALineIds,[0,1]);
  await reservePrepareReleaseActivate(user,scenario,"B",scenario.rentalBId,[scenario.rentalBLineId],[2]);
  const complete=await rpc(service,"complete_isolated_uat_multi_equipment_provisioning",{command:{companyId,actorId,scenarioKey}});if(!complete.success)return bad(String(complete.code));
  await service.schema("erp").rpc("finish_isolated_uat_provisioning_attempt",{command:{attemptId,actorId,state:"COMPLETED",safeResultCode:"PROVISIONED"}}); return safe(200,{success:true,result:"PROVISIONED",scenario:projection(scenario)});
 }catch(error){const raw=error instanceof Error?error.message:"PROVISIONING_FAILED";const [commandName,resultCode]=raw.split("::");const diagnostic={phase:"canonical-entity-provisioning",command:commandName||"unknown",resultCode:resultCode||"PROVISIONING_FAILED",actorPresent:true,tenantMatch:true};await service.schema("erp").rpc("record_isolated_uat_provisioning_diagnostic",{command:{companyId,actorId,scenarioKey,diagnostic}});await service.schema("erp").rpc("finish_isolated_uat_provisioning_attempt",{command:{attemptId,actorId,state:"FAILED",safeResultCode:resultCode||"PROVISIONING_FAILED"}});return safe(409,{success:false,code:resultCode||"PROVISIONING_FAILED",diagnostic});}
}

async function reservePrepareReleaseActivate(client:any,scenario:Scenario,label:string,rentalId:string,lineIds:string[],indices:number[]){
 const rentalNumber=`UAT-ME-${label}-20260829`;
 const lines=lineIds.map((id,index)=>({id,equipmentId:scenario.equipmentIds[indices[index]],assignmentId:scenario.assignmentIds[indices[index]],operatorId:scenario.operatorIds[indices[index]]}));
 const reserved=await rpc(client,"command_create_reserved_rental",{command:{...command(rentalId,`RENTAL-${label}`),rentalId,rentalNumber,customerId:scenario.customerId,projectId:scenario.projectId,dateOut:workDate,expectedReturn:workDate,rentalType:"Operated Rental",lines}});
 let version=Number((reserved.value as Record<string,unknown>)?.version);
 const preparedLines=lineIds.map(lineId=>({lineId,commercialTerms:{billingMethod:"PER_HOUR",unitRate:1000,minimumBillableHours:0,overtimeRate:0,standbyRate:0,mobilizationFee:0,demobilizationFee:0,fuelCharge:0,operatorIncluded:true,operatorRate:0,taxRate:0,withholdingTax:0,contractAmount:0,currency:"PHP"},costCodeId:scenario.costCodeId,activityCodeId:scenario.activityCodeId,workDescriptionId:scenario.workDescriptionId,operationalRemarks:"Synthetic isolated-UAT multi-equipment runtime certification.",deurPolicy:{frequency:"PER_WORKDAY",effectiveFrom:workDate},shiftWindows:[],workDate,meterRequirement:"hourMeter"}));
 const prepared=await rpc(client,"command_prepare_reserved_rental_aggregate",{command:{...command(rentalId,`PREPARE-${label}`),expectedRentalVersion:version,rentalId,lines:preparedLines}});version=Number((prepared.value as Record<string,unknown>)?.version);
 const released=await rpc(client,"command_release_rental",{command:{...command(rentalId,`RELEASE-${label}`),rentalId,expectedVersion:version}});version=Number((released.value as Record<string,unknown>)?.version);
 await rpc(client,"command_activate_rental",{command:{...command(rentalId,`ACTIVATE-${label}`),rentalId,expectedVersion:version}});
}
function projection(s:Scenario){return{scenarioKey,profile,rentalA:{id:s.rentalAId,lineIds:s.rentalALineIds,equipmentIds:s.equipmentIds.slice(0,2)},rentalB:{id:s.rentalBId,lineId:s.rentalBLineId,equipmentId:s.equipmentIds[2]},references:{customerId:s.customerId,projectId:s.projectId,operatorIds:s.operatorIds,costCodeId:s.costCodeId,activityCodeId:s.activityCodeId}};}
