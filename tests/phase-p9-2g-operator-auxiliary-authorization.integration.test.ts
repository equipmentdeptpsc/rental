import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createRemoteCore } from "@/core/remote";
import { SupabaseCurrentUserAuthorizationRepository } from "@/integrations/supabase/SupabaseCurrentUserAuthorizationRepository";
import { SupabaseOperationalEventRepository } from "@/integrations/supabase/SupabaseOperationalEventRepository";
import { createSupabaseReadRepositories } from "@/integrations/supabase/readRepositories";
import { assertSupabaseFixtureMutationAllowed, createSupabasePhaseC2Harness, readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";

const config=readSupabasePhaseC2TestConfiguration();
const local=config.url?["localhost","127.0.0.1"].includes(new URL(config.url).hostname):false;
const enabled=config.enabled&&local&&process.env.RUN_P9_2G_LOCAL==="true";
const container=process.env.P9_2G_LOCAL_DB_CONTAINER??"";
const tenant="TENANT-UAT-P9-2G",otherTenant="TENANT-UAT-P9-2G-B";

describe.skipIf(!enabled)("P9.2G Operator auxiliary and authorization-catalog boundary",()=>{
  const harness=enabled?createSupabasePhaseC2Harness(config):undefined;
  const password=`P9G-${randomBytes(24).toString("base64url")}`;
  const identities:Record<string,{id:string,email:string}>={};const clients:Record<string,SupabaseClient>={};
  const labels=["a","b","c","linked-broad","operations","administrator","auditor","missing","inactive"];
  const owner=(sql:string)=>{if(!container.startsWith("supabase_db_"))throw new Error("Verified local container required");const result=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-X","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",windowsHide:true});if(result.status!==0)throw new Error(result.stderr)};

  beforeAll(async()=>{
    assertSupabaseFixtureMutationAllowed(config,[tenant,otherTenant]);
    for(const label of labels){const result=await harness!.admin.auth.admin.createUser({email:`p9-2g-${label}-${randomBytes(5).toString("hex")}@example.invalid`,password,email_confirm:true});if(result.error||!result.data.user)throw result.error;identities[label]={id:result.data.user.id,email:result.data.user.email!}}
    owner(`BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class)VALUES('${tenant}','P92G','P9.2G','test'),('${otherTenant}','P92GB','P9.2G B','test');
      INSERT INTO erp.customers(id,name,active,company_id)VALUES('CUSTOMER-P9-2G-A','Customer A',true,'${tenant}'),('CUSTOMER-P9-2G-B','Customer B',true,'${tenant}'),('CUSTOMER-P9-2G-FOREIGN','Foreign',true,'${otherTenant}');
      INSERT INTO erp.projects(id,name,customer_id,active,company_id)VALUES('PROJECT-P9-2G','Project','CUSTOMER-P9-2G-A',true,'${tenant}');
      INSERT INTO erp.cost_codes(id,code,name)VALUES('COST-P9-2G','P92G','Cost');INSERT INTO erp.activity_codes(id,code,name)VALUES('ACT-P9-2G','P92G','Activity');
      INSERT INTO erp.operators(id,name,status,company_id)VALUES('OP-P9-2G-A','A','Active','${tenant}'),('OP-P9-2G-B','B','Active','${tenant}'),('OP-P9-2G-C','C','Active','${tenant}'),('OP-P9-2G-BROAD','Broad','Active','${tenant}');
      INSERT INTO erp.equipment(id,asset_no,equipment_name,status_id,maintenance_type,cost_code_id,company_id)
        SELECT 'EQ-P9-2G-'||x,'P92G-'||x,'Equipment '||x,s.id,'Engine Hours','COST-P9-2G','${tenant}' FROM unnest(ARRAY['A','B','C'])x CROSS JOIN LATERAL(SELECT id FROM erp.equipment_statuses WHERE lower(code)='available' LIMIT 1)s;
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id)
        SELECT 'AS-P9-2G-'||x,'EQ-P9-2G-'||x,'OP-P9-2G-'||x,'PROJECT-P9-2G','ACT-P9-2G','2026-08-15','2026-08-20','Active','${tenant}' FROM unnest(ARRAY['A','B','C'])x;
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,released_at,company_id)
        VALUES('RENTAL-P9-2G','P92G-001','CUSTOMER-P9-2G-A','PROJECT-P9-2G','Customer A','Project','2026-08-15','Operated Rental','Released',clock_timestamp(),'${tenant}');
      INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,company_id)
        SELECT 'LINE-P9-2G-'||x,'RENTAL-P9-2G','EQ-P9-2G-'||x,'AS-P9-2G-'||x,'OP-P9-2G-'||x,'Released','${tenant}' FROM unnest(ARRAY['A','B','C'])x;
      INSERT INTO erp.deurs(id,rental_id,rental_equipment_line_id,assignment_id,equipment_id,operator_id,project_id,customer_id,work_date,status,company_id)
        SELECT 'DEUR-P9-2G-'||x,'RENTAL-P9-2G','LINE-P9-2G-'||x,'AS-P9-2G-'||x,'EQ-P9-2G-'||x,'OP-P9-2G-'||x,'PROJECT-P9-2G','CUSTOMER-P9-2G-A','2026-08-15','In Progress','${tenant}' FROM unnest(ARRAY['A','B','C'])x;
      INSERT INTO erp.deur_events(id,deur_id,activity_type,action,occurred_at,sequence,source,is_open,company_id)
        SELECT 'EVENT-P9-2G-'||x,'DEUR-P9-2G-'||x,'operation','start',clock_timestamp(),1,'server',true,'${tenant}' FROM unnest(ARRAY['A','B','C'])x;
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id)VALUES
        ('${identities.a.id}'::uuid,'p92g-a','A','active','OP-P9-2G-A','${tenant}'),('${identities.b.id}'::uuid,'p92g-b','B','active','OP-P9-2G-B','${tenant}'),('${identities.c.id}'::uuid,'p92g-c','C','active','OP-P9-2G-C','${tenant}'),
        ('${identities["linked-broad"].id}'::uuid,'p92g-broad','Broad','active','OP-P9-2G-BROAD','${tenant}'),('${identities.operations.id}'::uuid,'p92g-operations','Operations','active',NULL,'${tenant}'),
        ('${identities.administrator.id}'::uuid,'p92g-admin','Administrator','active',NULL,'${tenant}'),('${identities.auditor.id}'::uuid,'p92g-auditor','Auditor','active',NULL,'${tenant}'),('${identities.inactive.id}'::uuid,'p92g-inactive','Inactive','inactive',NULL,'${tenant}');
      INSERT INTO erp.deur_meter_checkpoints(id,company_id,deur_id,rental_equipment_line_id,equipment_id,operator_id,kind,reading,created_by)
        VALUES('00000000-0000-0000-0000-00000000210a','${tenant}','DEUR-P9-2G-A','LINE-P9-2G-A','EQ-P9-2G-A','OP-P9-2G-A','opening',10,'${identities.a.id}'::uuid),
              ('00000000-0000-0000-0000-00000000210b','${tenant}','DEUR-P9-2G-B','LINE-P9-2G-B','EQ-P9-2G-B','OP-P9-2G-B','opening',20,'${identities.b.id}'::uuid),
              ('00000000-0000-0000-0000-00000000210c','${tenant}','DEUR-P9-2G-C','LINE-P9-2G-C','EQ-P9-2G-C','OP-P9-2G-C','opening',30,'${identities.c.id}'::uuid);
      INSERT INTO erp.audit_log(id,aggregate_type,aggregate_id,action,company_id)VALUES('AUDIT-P9-2G','Rental','RENTAL-P9-2G','FIXTURE','${tenant}');
      INSERT INTO erp.number_sequences(id,scope,sequence_year,current_value,prefix,company_id)VALUES('00000000-0000-0000-0000-000000002200','DEUR',2026,10,'D','${tenant}');
      INSERT INTO erp.recovery_compensations(id,company_id,target_entity_type,target_entity_id,recovery_action,reason,initiated_by,prior_state,resulting_state,prior_version,resulting_version,idempotency_key)
        VALUES('00000000-0000-0000-0000-000000002300','${tenant}','RENTAL','RENTAL-P9-2G','REOPEN','P9.2G fixture recovery evidence','${identities.operations.id}'::uuid,'{}','{}',1,2,'P9G-RECOVERY');
      INSERT INTO erp.app_roles(id,code,name)VALUES('ROLE-P9-2G-BROAD','p9-2g-broad','Broad'),('ROLE-P9-2G-OPS','p9-2g-operations','Operations'),('ROLE-P9-2G-ADMIN','p9-2g-administrator','Administrator'),('ROLE-P9-2G-AUDIT','p9-2g-auditor','Auditor');
      INSERT INTO erp.role_permissions(role_id,permission_id)SELECT 'ROLE-P9-2G-BROAD',id FROM erp.app_permissions;
      INSERT INTO erp.role_permissions(role_id,permission_id)SELECT 'ROLE-P9-2G-OPS',id FROM erp.app_permissions WHERE code IN('deur.read','customer.read','rental.manage');
      INSERT INTO erp.role_permissions(role_id,permission_id)SELECT 'ROLE-P9-2G-ADMIN',id FROM erp.app_permissions WHERE code IN('users.manage','settings.read','masterData.read','rental.manage','billing.read','deur.read','customer.read');
      INSERT INTO erp.role_permissions(role_id,permission_id)SELECT 'ROLE-P9-2G-AUDIT',id FROM erp.app_permissions WHERE code IN('reports.read','users.read');
      INSERT INTO erp.user_roles(user_id,role_id)VALUES
        ('${identities.a.id}'::uuid,'ROLE-P9-2G-BROAD'),('${identities.b.id}'::uuid,'ROLE-P9-2G-BROAD'),('${identities.c.id}'::uuid,'ROLE-P9-2G-BROAD'),('${identities["linked-broad"].id}'::uuid,'ROLE-P9-2G-BROAD'),
        ('${identities.operations.id}'::uuid,'ROLE-P9-2G-OPS'),('${identities.administrator.id}'::uuid,'ROLE-P9-2G-ADMIN'),('${identities.auditor.id}'::uuid,'ROLE-P9-2G-AUDIT'),('${identities.inactive.id}'::uuid,'ROLE-P9-2G-BROAD');COMMIT;`);
    for(const label of labels){const client=createClient(config.url!,config.publishableKey!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email:identities[label].email,password})).error).toBeNull();clients[label]=client}
  });

  const ids=async(label:string,table:string)=>{const field=table==="role_permissions"?"role_id":"id";const result=await clients[label].schema("erp").from(table).select(field).order(field);expect(result.error).toBeNull();return(result.data??[]).map(row=>String((row as Record<string,unknown>)[field]))};
  it.each([["a","A","00000000-0000-0000-0000-00000000210a"],["b","B","00000000-0000-0000-0000-00000000210b"],["c","C","00000000-0000-0000-0000-00000000210c"]])("limits Operator %s to own event and meter evidence",async(label,suffix,checkpoint)=>{
    expect(await ids(label,"deur_events")).toEqual([`EVENT-P9-2G-${suffix}`]);expect(await ids(label,"deur_meter_checkpoints")).toEqual([checkpoint]);
    for(const foreign of ["A","B","C"].filter(value=>value!==suffix)){const event=await clients[label].schema("erp").from("deur_events").select("id").eq("id",`EVENT-P9-2G-${foreign}`);expect(event.error).toBeNull();expect(event.data).toEqual([])}
  });
  it("makes linked broad-permission Operators self-only and hides catalogs and internals",async()=>{
    expect(await ids("a","users")).toEqual([identities.a.id]);
    for(const label of ["a","linked-broad"])for(const table of ["app_permissions","app_roles","role_permissions","audit_log","number_sequences","recovery_compensations","customers"])expect(await ids(label,table)).toEqual([]);
  });
  it("preserves unlinked Administrator and Operations positive access",async()=>{
    expect((await ids("administrator","users")).length).toBe(8);expect((await ids("administrator","app_roles")).length).toBeGreaterThan(4);expect((await ids("administrator","app_permissions")).length).toBeGreaterThan(20);expect((await ids("administrator","role_permissions")).length).toBeGreaterThan(20);
    expect(await ids("administrator","audit_log")).toEqual(["AUDIT-P9-2G"]);expect(await ids("administrator","number_sequences")).toEqual(["00000000-0000-0000-0000-000000002200"]);expect(await ids("administrator","recovery_compensations")).toEqual(["00000000-0000-0000-0000-000000002300"]);
    expect(await ids("operations","deur_events")).toEqual(["EVENT-P9-2G-A","EVENT-P9-2G-B","EVENT-P9-2G-C"]);expect((await ids("operations","deur_meter_checkpoints")).length).toBe(3);expect(await ids("operations","customers")).toEqual(["CUSTOMER-P9-2G-A","CUSTOMER-P9-2G-B"]);expect(await ids("operations","recovery_compensations")).toEqual(["00000000-0000-0000-0000-000000002300"]);
    expect(await ids("auditor","audit_log")).toEqual(["AUDIT-P9-2G"]);expect(await ids("auditor","app_roles")).toEqual([]);
  });
  it("exposes only current-subject profile, permissions and roles through the React-free adapter",async()=>{
    const reads=createSupabaseReadRepositories(clients.a,createRemoteCore());const repository=new SupabaseCurrentUserAuthorizationRepository(clients.a,reads.users);
    const profile=await repository.getCurrentUserProfile();expect(profile.success&&profile.value.id).toBe(identities.a.id);
    const permissions=await repository.getCurrentUserEffectivePermissions();expect(permissions.success&&permissions.value).toContain("users.manage");
    const roles=await repository.getCurrentUserRoles();expect(roles).toMatchObject({success:true,value:["p9-2g-broad"]});
    const arbitrary=await clients.a.schema("erp").rpc("current_user_effective_permissions",{target_user_id:identities.b.id});expect(arbitrary.error).not.toBeNull();
    expect((await clients.missing.schema("erp").rpc("current_user_effective_permissions")).data).toEqual([]);expect((await clients.inactive.schema("erp").rpc("current_user_effective_permissions")).data).toEqual([]);
  });
  it("scopes the actual polling repository before client projection",async()=>{
    const page=await new SupabaseOperationalEventRepository(clients.a).listAfter({tenantId:tenant,rentalId:"RENTAL-P9-2G"});
    expect(page.events.map(event=>event.eventId)).toEqual(["EVENT-P9-2G-A"]);
    expect(page.events[0]).toMatchObject({rentalLineId:"LINE-P9-2G-A",equipmentId:"EQ-P9-2G-A",operatorId:"OP-P9-2G-A"});
  });
});
