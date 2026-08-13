import {describe,expect,it} from "vitest";
import {readSupabasePhaseC2TestConfiguration} from "./support/supabasePhaseC2Harness";
import {executePhaseC4bPrivilegedSql} from "./support/phaseC4bPrivilegedSql";

const enabled=process.env.RUN_PHASE_C12_DAILY_SCHEDULER_PREFLIGHT==="true";
const tenant="TENANT-UAT-C12-GROUPED-CUSTOMER-001";
describe.skipIf(!enabled)("C12.2.6B mandatory preflight",()=>{
 it("has zero residue and the certified scheduler seams",()=>{
  expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
  expect(process.env.GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1?.trim()).toBeTruthy();
  expect(Object.keys(process.env).filter(k=>k.startsWith("VITE_")&&/(SECRET|KEY|TOKEN|PASSWORD)/i.test(k))).toEqual([]);
  const c=readSupabasePhaseC2TestConfiguration();
  const result=JSON.parse(executePhaseC4bPrivilegedSql(c,{tenantIds:[tenant],sql:`SELECT jsonb_build_object(
   'company',(SELECT count(*) FROM erp.companies WHERE id='${tenant}'),'batches',(SELECT count(*) FROM erp.customer_review_batches WHERE company_id='${tenant}'),
   'items',(SELECT count(*) FROM erp.customer_review_batch_items WHERE company_id='${tenant}'),'principals',(SELECT count(*) FROM erp.system_principals WHERE company_id='${tenant}'),
   'mappings',(SELECT count(*) FROM erp.system_principal_permissions p JOIN erp.system_principals s ON s.id=p.principal_id WHERE s.company_id='${tenant}'),
   'notifications',(SELECT count(*) FROM erp.notification_outbox WHERE company_id='${tenant}'),'attempts',(SELECT count(*) FROM erp.notification_delivery_attempts WHERE company_id='${tenant}'),
   'envelopes',(SELECT count(*) FROM erp.notification_delivery_envelopes e JOIN erp.notification_outbox n ON n.id=e.notification_id WHERE n.company_id='${tenant}'),
   'authUsers',(SELECT count(*) FROM auth.users WHERE raw_user_meta_data->>'fixtureTenant'='${tenant}'),'sequences',(SELECT count(*) FROM erp.number_sequences WHERE company_id='${tenant}'),
   'localTenant',(SELECT count(*) FROM erp.companies WHERE id=('TENANT-'||'LOCAL-001') AND code='LOCAL' AND environment_class='compatibility'),
   'resolver',(to_regprocedure('erp.resolve_grouped_review_scheduler_principal(text)') IS NOT NULL)::int,
   'prepare',(to_regprocedure('erp.trusted_prepare_grouped_customer_review_delivery_as_scheduler(jsonb)') IS NOT NULL)::int,
   'generate',(to_regprocedure('erp.command_generate_customer_review_batch(jsonb)') IS NOT NULL)::int,
   'publicAction',(to_regprocedure('erp.decide_customer_review_batch_item(jsonb,text)') IS NOT NULL)::int,
   'cleanup',(to_regprocedure('erp.cleanup_c12_grouped_customer_review_fixture(text,text,text)') IS NOT NULL)::int
  );`})) as {rows:Array<{jsonb_build_object:Record<string,number>}>};
  expect(result.rows[0].jsonb_build_object).toEqual({company:0,batches:0,items:0,principals:0,mappings:0,notifications:0,attempts:0,envelopes:0,authUsers:0,sequences:0,localTenant:1,resolver:1,prepare:1,generate:1,publicAction:1,cleanup:1});
 });
});
