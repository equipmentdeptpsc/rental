import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { GroupedReviewWorkerEnvironment } from "./configuration";

type SafeResult={status:number;body:Record<string,unknown>};
const safe=(status:number,body:Record<string,unknown>):SafeResult=>({status,body});
const scenarioKey="MULTI-EQUIPMENT-RUNTIME-CERT-2026-08-29",profile="UAT_MULTI_EQUIPMENT_PER_WORKDAY_V1",workDate="2026-08-29";
const bad=(code:string)=>safe(409,{success:false,code});

type Scenario={customerId:string;projectId:string;workDescriptionId:string;operatorIds:string[];equipmentIds:string[];assignmentIds:string[];rentalAId:string;rentalBId:string;rentalALineIds:string[];rentalBLineId:string;costCodeId:string;activityCodeId:string;createCustomer:boolean;createProject:boolean;createWorkDescription:boolean};
const uuid=()=>randomUUID();
const command=(id:string,action:string)=>({commandId:`UAT-ME-${action}-${id}`,idempotencyKey:`uat-multi-equipment:${action}:${id}`});

async function rpc(client:any,name:string,payload:Record<string,unknown>):Promise<Record<string,unknown>>{
 const result=await client.schema("erp").rpc(name,payload);const value=result.data as Record<string,unknown>|null;
 if(result.error||!value?.success)throw new Error(typeof value?.code==="string"?value.code:"CANONICAL_COMMAND_FAILED");return value;
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
  const company=await service.schema("erp").from("companies").select("id,active,environment_class").eq("id",companyId).eq("active",true).in("environment_class",["compatibility","test"]).maybeSingle();
 if(company.error||!company.data)return safe(403,{success:false,code:"UAT_TENANT_REQUIRED"});
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||Object.keys(body).some(key=>key!=="scenarioKey"&&key!=="profile")||body.scenarioKey!==scenarioKey||(body.profile!==undefined&&body.profile!==profile))return safe(400,{success:false,code:"VALIDATION_REJECTED"});
 const [costs,activities,customers,projects,workDescriptions]=await Promise.all([
  service.schema("erp").from("cost_codes").select("id,code,sort_order").eq("active",true).is("deleted_at",null).order("sort_order").order("code").limit(2),
  service.schema("erp").from("activity_codes").select("id,code,sort_order").eq("active",true).is("deleted_at",null).order("sort_order").order("code").limit(2),
   service.schema("erp").from("customers").select("id").eq("company_id",companyId).eq("active",true).is("deleted_at",null).eq("customer_code","UAT-ME-CERT-20260829").maybeSingle(),
   service.schema("erp").from("projects").select("id").eq("company_id",companyId).eq("active",true).is("deleted_at",null).eq("project_code","UAT-ME-CERT-20260829").maybeSingle(),
  service.schema("erp").from("work_descriptions").select("id").eq("active",true).is("deleted_at",null).eq("code","UAT-ME-RUNTIME-CERT").maybeSingle()
 ]);
 if(costs.error||activities.error||!costs.data?.[0]||!activities.data?.[0])return bad("UAT_REFERENCE_UNAVAILABLE");
 const draft:Scenario={customerId:customers.data?.id??uuid(),projectId:projects.data?.id??uuid(),workDescriptionId:workDescriptions.data?.id??uuid(),operatorIds:[uuid(),uuid(),uuid()],equipmentIds:[uuid(),uuid(),uuid()],assignmentIds:[uuid(),uuid(),uuid()],rentalAId:uuid(),rentalBId:uuid(),rentalALineIds:[uuid(),uuid()],rentalBLineId:uuid(),costCodeId:costs.data[0].id,activityCodeId:activities.data[0].id,createCustomer:!customers.data,createProject:!projects.data,createWorkDescription:!workDescriptions.data};
 const claim:Record<string,unknown>=await rpc(service,"claim_isolated_uat_multi_equipment_provisioning",{command:{companyId,actorId,scenarioKey,profileVersion:profile,scenario:draft}}).catch(error=>({success:false,code:error instanceof Error?error.message:"SCENARIO_CLAIM_FAILED"}));
 if(!claim.success)return bad(String(claim.code));
 const scenario=(claim.scenario??draft) as Scenario;
 if(!scenario||!Array.isArray(scenario.equipmentIds)||scenario.equipmentIds.length!==3)return bad("SCENARIO_INCONSISTENT");
 if(claim.state==="READY")return safe(200,{success:true,result:"REUSED",scenario:projection(scenario)});
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
  return safe(200,{success:true,result:"PROVISIONED",scenario:projection(scenario)});
 }catch(error){return bad(error instanceof Error?error.message:"PROVISIONING_FAILED");}
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
