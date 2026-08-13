import { randomBytes,randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe,expect,it } from "vitest";
import { assertSupabaseFixtureMutationAllowed,createSupabasePhaseC2Harness,readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration=readSupabasePhaseC2TestConfiguration();
const enabled=configuration.enabled&&process.env.RUN_PHASE_C12_MANAGER_AUTHORIZATION_CERTIFICATION==="true";
const tenant="TENANT-UAT-C12-MANAGER-EMAIL-001";
const operatorId="OPR-UAT-C12-MANAGER-EMAIL-001";
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;

describe.skipIf(!enabled)("C12 three-user Manager designation authorization",()=>{
 it("certifies Admin authority, same-role denials, resolver identity, and exact cleanup",async()=>{
  assertSupabaseFixtureMutationAllowed(configuration,[tenant]);
  expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
  const harness=createSupabasePhaseC2Harness(configuration);
  const owner=(sql:string)=>executePhaseC4bPrivilegedSql(configuration,{tenantIds:[tenant],sql});
  const value=(sql:string)=>JSON.parse(owner(sql)).rows[0].jsonb_build_object as Record<string,any>;
  const cleanup=()=>{const row=JSON.parse(owner(`SELECT erp.cleanup_c12_manager_real_email_fixture('${tenant}','${tenant}','CONFIRM-C12-MANAGER-EMAIL-CLEANUP');`)).rows[0];return Object.values(row)[0] as Record<string,unknown>;};
  const allZero=(result:Record<string,unknown>)=>expect(Object.values(result).every((count)=>count===0)).toBe(true);
  const firstZero=cleanup();allZero(firstZero);const secondZero=cleanup();allZero(secondZero);
  const liveFunction=value(`SELECT jsonb_build_object(
    'securityDefiner',(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
    'searchPath',(SELECT proconfig @> ARRAY['search_path=erp, pg_catalog'] FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
    'threeUsers',(SELECT pg_get_functiondef(p.oid) LIKE '%FROM users WHERE company_id=target_tenant_id) > 3%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
    'designationCleanup',(SELECT pg_get_functiondef(p.oid) LIKE '%DELETE FROM manager_review_recipient_configurations WHERE company_id=target_tenant_id%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp' AND p.proname='cleanup_c12_manager_real_email_fixture'),
    'publicExecute',(SELECT has_function_privilege('public','erp.cleanup_c12_manager_real_email_fixture(text,text,text)','EXECUTE')),
    'anonExecute',(SELECT has_function_privilege('anon','erp.cleanup_c12_manager_real_email_fixture(text,text,text)','EXECUTE')),
    'authenticatedExecute',(SELECT has_function_privilege('authenticated','erp.cleanup_c12_manager_real_email_fixture(text,text,text)','EXECUTE')),
    'serviceExecute',(SELECT has_function_privilege(('service_'||'role'),'erp.cleanup_c12_manager_real_email_fixture(text,text,text)','EXECUTE'))
  );`);
  expect(liveFunction).toEqual({securityDefiner:true,searchPath:true,threeUsers:true,designationCleanup:true,publicExecute:false,anonExecute:false,authenticatedExecute:false,serviceExecute:false});
  const password=`C12-${randomBytes(24).toString("base64url")}`;
  const identities=["administrator","manager","operator"].map(kind=>({kind,email:`c12-${kind}-${randomUUID()}@example.invalid`,id:""}));
  let fixtureCreated=false;
  try{
   for(const identity of identities){const created=await harness.admin.auth.admin.createUser({email:identity.email,password,email_confirm:true,user_metadata:{fixtureTenant:tenant,fixtureKind:identity.kind}});if(created.error||!created.data.user)throw created.error??new Error("Auth fixture creation failed");identity.id=created.data.user.id;}
   const admin=identities[0],manager=identities[1],operator=identities[2];
   owner(`BEGIN;
    INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C12 Manager Authorization UAT','test');
    INSERT INTO erp.operators(id,name,status,company_id) VALUES('${operatorId}','C12 Authorization Operator','Active','${tenant}');
    INSERT INTO erp.users(id,username,email,display_name,status,operator_id,company_id) VALUES
      ('${admin.id}'::uuid,${quote(admin.email)},${quote(admin.email)},'C12 Authorization Administrator','active',NULL,'${tenant}'),
      ('${manager.id}'::uuid,${quote(manager.email)},${quote(manager.email)},'C12 Authorization Manager','active',NULL,'${tenant}'),
      ('${operator.id}'::uuid,${quote(operator.email)},${quote(operator.email)},'C12 Authorization Operator','active','${operatorId}','${tenant}');
    INSERT INTO erp.user_roles(user_id,role_id) VALUES
      ('${admin.id}'::uuid,'ROLE-CANON-SYSTEM-ADMINISTRATOR'),
      ('${manager.id}'::uuid,'ROLE-CANON-RENTAL-OPERATIONS'),
      ('${operator.id}'::uuid,'ROLE-CANON-RENTAL-OPERATIONS');COMMIT;`);
   fixtureCreated=true;
   const client=(key:string)=>createClient(configuration.url!,configuration.publishableKey!,{auth:{persistSession:false,autoRefreshToken:false,storageKey:key}});
   const adminClient=client(`c12-admin-${randomUUID()}`),managerClient=client(`c12-manager-${randomUUID()}`),operatorClient=client(`c12-operator-${randomUUID()}`);
   expect((await adminClient.auth.signInWithPassword({email:admin.email,password})).error).toBeNull();
   expect((await managerClient.auth.signInWithPassword({email:manager.email,password})).error).toBeNull();
   expect((await operatorClient.auth.signInWithPassword({email:operator.email,password})).error).toBeNull();
   const configured=await adminClient.schema("erp").rpc("configure_manager_review_recipient",{target_user_id:manager.id});expect(configured.error).toBeNull();expect(configured.data).toMatchObject({success:true,code:"CONFIGURED",userId:manager.id});
   const managerDenied=await managerClient.schema("erp").rpc("configure_manager_review_recipient",{target_user_id:manager.id});expect(managerDenied.error).toBeNull();expect(managerDenied.data).toEqual({success:false,code:"FORBIDDEN"});
   const operatorDenied=await operatorClient.schema("erp").rpc("configure_manager_review_recipient",{target_user_id:operator.id});expect(operatorDenied.error).toBeNull();expect(operatorDenied.data).toEqual({success:false,code:"FORBIDDEN"});
   const assigned=value(`WITH claim AS (SELECT set_config('request.jwt.claim.sub','${admin.id}',true)) SELECT jsonb_build_object('count',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}' AND active),'manager',(SELECT user_id='${manager.id}'::uuid FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'resolver',(SELECT resolution_code||':'||user_id::text FROM erp.resolve_manager_review_recipient('${tenant}')),'sameRoles',(SELECT count(DISTINCT role_id)=1 FROM erp.user_roles WHERE user_id IN('${manager.id}'::uuid,'${operator.id}'::uuid)),'bothApprove',(SELECT count(DISTINCT ur.user_id)=2 FROM erp.user_roles ur JOIN erp.role_permissions rp ON rp.role_id=ur.role_id JOIN erp.app_permissions p ON p.id=rp.permission_id WHERE ur.user_id IN('${manager.id}'::uuid,'${operator.id}'::uuid) AND p.code='rental.approve')) FROM claim;`);
   expect(assigned).toEqual({count:1,manager:true,resolver:`OK:${manager.id}`,sameRoles:true,bothApprove:true});
   const removed=await adminClient.schema("erp").rpc("configure_manager_review_recipient",{target_user_id:null});expect(removed.data).toEqual({success:true,code:"REMOVED"});
   const unconfigured=value(`WITH claim AS (SELECT set_config('request.jwt.claim.sub','${admin.id}',true)) SELECT jsonb_build_object('designationCount',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'resolver',(SELECT resolution_code FROM erp.resolve_manager_review_recipient('${tenant}'))) FROM claim;`);expect(unconfigured).toEqual({designationCount:0,resolver:"MANAGER_REVIEWER_NOT_CONFIGURED"});
   const reconfigured=await adminClient.schema("erp").rpc("configure_manager_review_recipient",{target_user_id:manager.id});expect(reconfigured.data).toMatchObject({success:true,code:"CONFIGURED",userId:manager.id});
   await adminClient.auth.signOut();await managerClient.auth.signOut();await operatorClient.auth.signOut();
   const passOne=cleanup();expect(passOne).toMatchObject({manager_designations:1,user_roles:3,application_users:3,operators:1,companies:1});
   fixtureCreated=false;
   let removedAuth=0;for(const identity of identities){const deleted=await harness.admin.auth.admin.deleteUser(identity.id);if(deleted.error)throw deleted.error;removedAuth++;}expect(removedAuth).toBe(3);
   const passTwo=cleanup();allZero(passTwo);
   const residue=value(`SELECT jsonb_build_object('companies',(SELECT count(*) FROM erp.companies WHERE id='${tenant}'),'users',(SELECT count(*) FROM erp.users WHERE company_id='${tenant}'),'roles',(SELECT count(*) FROM erp.user_roles ur JOIN erp.users u ON u.id=ur.user_id WHERE u.company_id='${tenant}'),'operators',(SELECT count(*) FROM erp.operators WHERE company_id='${tenant}'),'designations',(SELECT count(*) FROM erp.manager_review_recipient_configurations WHERE company_id='${tenant}'),'sequences',(SELECT count(*) FROM erp.number_sequences WHERE company_id LIKE ('TENANT-'||'UAT-%')),'localTenant',(SELECT count(*) FROM erp.companies WHERE id=('TENANT-'||'LOCAL-001') AND code='LOCAL' AND environment_class='compatibility'),'adminRole',(SELECT count(*) FROM erp.app_roles WHERE id='ROLE-CANON-SYSTEM-ADMINISTRATOR'),'operationsRole',(SELECT count(*) FROM erp.app_roles WHERE id='ROLE-CANON-RENTAL-OPERATIONS'),'usersManage',(SELECT count(*) FROM erp.app_permissions WHERE id='PERM-CANON-USERS-MANAGE'));`);
   expect(residue).toEqual({companies:0,users:0,roles:0,operators:0,designations:0,sequences:0,localTenant:1,adminRole:1,operationsRole:1,usersManage:1});
   let authResidue=0;for(let page=1;;page++){const listed=await harness.admin.auth.admin.listUsers({page,perPage:100});if(listed.error)throw listed.error;authResidue+=listed.data.users.filter(user=>user.user_metadata?.fixtureTenant===tenant).length;if(listed.data.users.length<100)break;}expect(authResidue).toBe(0);
   const auditTwo=cleanup();allZero(auditTwo);
  }finally{
   if(fixtureCreated){try{cleanup();}catch{}for(const identity of identities)if(identity.id)try{await harness.admin.auth.admin.deleteUser(identity.id);}catch{}try{cleanup();}catch{}}
  }
 },180_000);
});
