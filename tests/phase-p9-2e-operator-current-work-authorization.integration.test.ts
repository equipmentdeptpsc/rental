import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { assertSupabaseFixtureMutationAllowed, createSupabasePhaseC2Harness, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";

const config=readSupabasePhaseC2TestConfiguration();
const local=config.url ? ["localhost","127.0.0.1"].includes(new URL(config.url).hostname) : false;
const enabled=config.enabled&&local&&process.env.RUN_P9_2E_LOCAL==="true";
const container=process.env.P9_2E_LOCAL_DB_CONTAINER??"";
const tenant="TENANT-UAT-P9-2E",otherTenant="TENANT-UAT-P9-2E-B";

describe.skipIf(!enabled)("P9.2E server-enforced Operator Current Work",()=>{
  const harness=enabled?createSupabasePhaseC2Harness(config):undefined;
  const password=`P9E-${randomBytes(24).toString("base64url")}`;
  const clients:Record<string,SupabaseClient>={};const identities:Record<string,{id:string,email:string}>={};
  const owner=(sql:string)=>{if(!container.startsWith("supabase_db_"))throw new Error("Verified local container required");const result=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-X","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",windowsHide:true});if(result.status!==0)throw new Error(result.stderr)};
  beforeAll(async()=>{
    assertSupabaseFixtureMutationAllowed(config,[tenant,otherTenant]);
    for(const label of ["operations","a","b","c","missing","inactive-user","inactive-operator"]){const result=await harness!.admin.auth.admin.createUser({email:`p9-2e-${label}-${randomBytes(5).toString("hex")}@example.invalid`,password,email_confirm:true});if(result.error||!result.data.user)throw result.error;identities[label]={id:result.data.user.id,email:result.data.user.email!}}
    owner(`BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)VALUES('${tenant}','P92E','P9.2E','test'),('${otherTenant}','P92EB','P9.2E B','test');
      INSERT INTO erp.customers(id,name,active,company_id)VALUES('CUSTOMER-P9-2E','Customer',true,'${tenant}'),('CUSTOMER-P9-2E-B','Customer B',true,'${otherTenant}');
      INSERT INTO erp.projects(id,name,customer_id,active,company_id)VALUES('PROJECT-P9-2E','Project','CUSTOMER-P9-2E',true,'${tenant}'),('PROJECT-P9-2E-B','Project B','CUSTOMER-P9-2E-B',true,'${otherTenant}');
      INSERT INTO erp.cost_codes(id,code,name)VALUES('COST-P9-2E','P92E','Cost'); INSERT INTO erp.activity_codes(id,code,name)VALUES('ACT-P9-2E','P92E','Activity');
      INSERT INTO erp.operators(id,name,status,company_id)VALUES('OP-P9-2E-A','A','Active','${tenant}'),('OP-P9-2E-B','B','Active','${tenant}'),('OP-P9-2E-C','C','Active','${tenant}'),('OP-P9-2E-INACTIVE','Inactive','Suspended','${tenant}'),('OP-P9-2E-FOREIGN','Foreign','Active','${otherTenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,cost_code_id,company_id) SELECT 'EQ-P9-2E-'||x.label,'P92E-'||x.label,'Equipment '||x.label,s.id,'Engine Hours','COST-P9-2E',x.company_id FROM (VALUES('A','${tenant}'),('B','${tenant}'),('C','${tenant}'),('FOREIGN','${otherTenant}'))x(label,company_id) CROSS JOIN LATERAL(SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' LIMIT 1)s;
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id)VALUES('AS-P9-2E-A','EQ-P9-2E-A','OP-P9-2E-A','PROJECT-P9-2E','ACT-P9-2E','2026-08-15','2026-08-20','Active','${tenant}'),('AS-P9-2E-B','EQ-P9-2E-B','OP-P9-2E-B','PROJECT-P9-2E','ACT-P9-2E','2026-08-15','2026-08-20','Active','${tenant}'),('AS-P9-2E-C','EQ-P9-2E-C','OP-P9-2E-C','PROJECT-P9-2E','ACT-P9-2E','2026-08-15','2026-08-20','Active','${tenant}'),('AS-P9-2E-FOREIGN','EQ-P9-2E-FOREIGN','OP-P9-2E-FOREIGN','PROJECT-P9-2E-B','ACT-P9-2E','2026-08-15','2026-08-20','Active','${otherTenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,released_at,company_id)VALUES('RENTAL-P9-2E','P92E-001','CUSTOMER-P9-2E','PROJECT-P9-2E','Customer','Project','2026-08-15','Operated Rental','Released',clock_timestamp(),'${tenant}'),('RENTAL-P9-2E-FOREIGN','P92E-B','CUSTOMER-P9-2E-B','PROJECT-P9-2E-B','Customer B','Project B','2026-08-15','Operated Rental','Released',clock_timestamp(),'${otherTenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)VALUES('LINE-P9-2E-A','RENTAL-P9-2E','EQ-P9-2E-A','AS-P9-2E-A','OP-P9-2E-A','Released','${tenant}'),('LINE-P9-2E-B','RENTAL-P9-2E','EQ-P9-2E-B','AS-P9-2E-B','OP-P9-2E-B','Released','${tenant}'),('LINE-P9-2E-C','RENTAL-P9-2E','EQ-P9-2E-C','AS-P9-2E-C','OP-P9-2E-C','Released','${tenant}'),('LINE-P9-2E-FOREIGN','RENTAL-P9-2E-FOREIGN','EQ-P9-2E-FOREIGN','AS-P9-2E-FOREIGN','OP-P9-2E-FOREIGN','Released','${otherTenant}');
      INSERT INTO erp.deurs(id,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,status,company_id)VALUES('DEUR-P9-2E-A','RENTAL-P9-2E','LINE-P9-2E-A','AS-P9-2E-A','EQ-P9-2E-A','OP-P9-2E-A','PROJECT-P9-2E','CUSTOMER-P9-2E','2026-08-15','In Progress','${tenant}'),('DEUR-P9-2E-B','RENTAL-P9-2E','LINE-P9-2E-B','AS-P9-2E-B','EQ-P9-2E-B','OP-P9-2E-B','PROJECT-P9-2E','CUSTOMER-P9-2E','2026-08-15','In Progress','${tenant}'),('DEUR-P9-2E-C','RENTAL-P9-2E','LINE-P9-2E-C','AS-P9-2E-C','EQ-P9-2E-C','OP-P9-2E-C','PROJECT-P9-2E','CUSTOMER-P9-2E','2026-08-15','In Progress','${tenant}'),('DEUR-P9-2E-FOREIGN','RENTAL-P9-2E-FOREIGN','LINE-P9-2E-FOREIGN','AS-P9-2E-FOREIGN','EQ-P9-2E-FOREIGN','OP-P9-2E-FOREIGN','PROJECT-P9-2E-B','CUSTOMER-P9-2E-B','2026-08-15','In Progress','${otherTenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)VALUES('${identities.a.id}'::uuid,'p92e-a','A','active','OP-P9-2E-A','${tenant}'),('${identities.b.id}'::uuid,'p92e-b','B','active','OP-P9-2E-B','${tenant}'),('${identities.c.id}'::uuid,'p92e-c','C','active','OP-P9-2E-C','${tenant}'),('${identities["inactive-user"].id}'::uuid,'p92e-inactive-user','Inactive','inactive','OP-P9-2E-A','${tenant}'),('${identities["inactive-operator"].id}'::uuid,'p92e-inactive-operator','Inactive Operator','active','OP-P9-2E-INACTIVE','${tenant}'),('${identities.operations.id}'::uuid,'p92e-operations','Operations','active',NULL,'${tenant}');
      INSERT INTO erp.app_roles(id,code,name)VALUES('ROLE-P9-2E-OP','p9-2e-operator','Operator'),('ROLE-P9-2E-OPS','p9-2e-operations','Operations');
      INSERT INTO erp.role_permissions(role_id,permission_id) SELECT 'ROLE-P9-2E-OP',id FROM erp.app_permissions WHERE code IN('assignment.read','rental.read','equipment.read','project.read','deur.read');
      INSERT INTO erp.role_permissions(role_id,permission_id) SELECT 'ROLE-P9-2E-OPS',id FROM erp.app_permissions WHERE code IN('assignment.read','rental.read','equipment.read','project.read','operator.read','deur.review');
      INSERT INTO erp.user_roles(user_id,role_id)VALUES('${identities.a.id}'::uuid,'ROLE-P9-2E-OP'),('${identities.b.id}'::uuid,'ROLE-P9-2E-OP'),('${identities.c.id}'::uuid,'ROLE-P9-2E-OP'),('${identities["inactive-user"].id}'::uuid,'ROLE-P9-2E-OP'),('${identities["inactive-operator"].id}'::uuid,'ROLE-P9-2E-OPS'),('${identities.operations.id}'::uuid,'ROLE-P9-2E-OPS'); COMMIT;`);
    for(const label of Object.keys(identities)){const client=createClient(config.url!,config.publishableKey!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email:identities[label].email,password})).error).toBeNull();clients[label]=client}
  });

  const ids=async(client:SupabaseClient,table:string)=>{const result=await client.schema("erp").from(table).select("id").order("id");expect(result.error).toBeNull();return (result.data??[]).map(row=>row.id)};
  it.each([["a","A"],["b","B"],["c","C"]])("limits Operator %s direct reads to owned work",async(label,suffix)=>{
    const client=clients[label];expect(await ids(client,"assignments")).toEqual([`AS-P9-2E-${suffix}`]);expect(await ids(client,"rental_equipment_lines")).toEqual([`LINE-P9-2E-${suffix}`]);expect(await ids(client,"equipment")).toEqual([`EQ-P9-2E-${suffix}`]);expect(await ids(client,"operators")).toEqual([`OP-P9-2E-${suffix}`]);expect(await ids(client,"projects")).toEqual(["PROJECT-P9-2E"]);expect(await ids(client,"rentals")).toEqual(["RENTAL-P9-2E"]);expect(await ids(client,"deurs")).toEqual([`DEUR-P9-2E-${suffix}`]);
    for(const foreignSuffix of ["A","B","C"].filter(value=>value!==suffix)){for(const [table,prefix] of [["assignments","AS"],["rental_equipment_lines","LINE"],["equipment","EQ"],["operators","OP"],["deurs","DEUR"]]){const result=await client.schema("erp").from(table).select("id").eq("id",`${prefix}-P9-2E-${foreignSuffix}`);expect(result.error).toBeNull();expect(result.data).toEqual([])}}
  });
  it("keeps unlinked privileged Operations tenant-wide while missing/inactive personas fail closed",async()=>{
    expect(await ids(clients.operations,"assignments")).toEqual(["AS-P9-2E-A","AS-P9-2E-B","AS-P9-2E-C"]);expect(await ids(clients.operations,"rental_equipment_lines")).toEqual(["LINE-P9-2E-A","LINE-P9-2E-B","LINE-P9-2E-C"]);expect(await ids(clients.operations,"deurs")).toEqual(["DEUR-P9-2E-A","DEUR-P9-2E-B","DEUR-P9-2E-C"]);
    for(const label of ["missing","inactive-user","inactive-operator"])for(const table of ["assignments","rental_equipment_lines","rentals","equipment","operators","projects","deurs"])expect(await ids(clients[label],table)).toEqual([]);
  });
});
