import pg from "pg";
import { randomUUID } from "node:crypto";
const {Client}=pg,config={host:"127.0.0.1",port:55432,user:"postgres",password:"codex_disposable_cert",database:"postgres"};
const admin=new Client(config);await admin.connect();
await admin.query(`
 INSERT INTO erp.companies(id,code,name) VALUES('TENANT-M220-CONC','M220C','M220 concurrency');
 INSERT INTO auth.users(id,role,email) VALUES('22000000-0000-4000-8000-000000000101','authenticated','admin-conc@example.test');
 INSERT INTO erp.users(id,username,display_name,email,status,company_id) VALUES('22000000-0000-4000-8000-000000000101','admin-conc','Admin','admin-conc@example.test','active','TENANT-M220-CONC');
 INSERT INTO erp.user_roles(user_id,role_id) SELECT '22000000-0000-4000-8000-000000000101',id FROM erp.app_roles WHERE code='system-administrator';
 INSERT INTO erp.app_roles(id,code,name) VALUES('ROLE-M220-OPERATOR','operator','Operator') ON CONFLICT(code) DO NOTHING;
 INSERT INTO erp.operators(id,name,status,company_id)
 SELECT 'M220-CONCURRENT-OP-' || n, 'Concurrent Operator ' || n, 'Active', 'TENANT-M220-CONC'
 FROM generate_series(1,5) AS n;
 CREATE FUNCTION erp.m220_hold_user_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(0.1);RETURN NEW;END$$;
 CREATE TRIGGER m220_hold_user_insert BEFORE INSERT ON erp.users FOR EACH ROW EXECUTE FUNCTION erp.m220_hold_user_insert();
`);
const actor="22000000-0000-4000-8000-000000000101",tenant="TENANT-M220-CONC";
const make=async(c)=>{const id=randomUUID();await admin.query("insert into auth.users(id,role,email) values($1,'authenticated',$2)",[id,`${id}@auth.test`]);return{actorId:actor,companyId:tenant,authUserId:id,commandId:randomUUID(),idempotencyKey:randomUUID(),displayName:"Concurrent User",roleCodes:["finance"],...c}};
const call=async(command)=>{const client=new Client(config);await client.connect();const started=Date.now();try{const row=await client.query("select erp.command_provision_application_user($1::jsonb) result",[JSON.stringify(command)]);return{result:row.rows[0].result,ms:Date.now()-started}}catch(error){return{error:String(error),ms:Date.now()-started}}finally{await client.end()}};
const count=async(pattern)=>{const q=await admin.query(`select count(*)::int users,(select count(*)::int from erp.user_roles ur join erp.users u on u.id=ur.user_id where u.company_id=$2 and lower(u.username) like lower($1)) roles,(select count(*)::int from erp.audit_log where company_id=$2 and aggregate_type='User' and lower(new_values->>'username') like lower($1) and action='USER_CREATED') created from erp.users where company_id=$2 and lower(username) like lower($1)`,[pattern,tenant]);return q.rows[0]};
const outcomes=[];let failed=false;
for(let i=1;i<=5;i++){
 const a=await make({username:`concurrent.user.${i}`,email:`concurrent-a-${i}@example.test`}),b=await make({username:`CONCURRENT.USER.${i}`,email:`concurrent-b-${i}@example.test`});const r=await Promise.all([call(a),call(b)]);const c=await count(`concurrent.user.${i}`);const ok=r.filter(x=>x.result?.success).length===1&&r.some(x=>x.result?.code==="USERNAME_CONFLICT")&&!r.some(x=>x.error)&&c.users===1&&c.created===1;outcomes.push({scenario:"username",i,r,c,ok});failed||=!ok;
}
for(let i=1;i<=5;i++){
 const a=await make({username:`email-a-${i}`,email:`shared-${i}@example.test`}),b=await make({username:`email-b-${i}`,email:`SHARED-${i}@example.test`});const r=await Promise.all([call(a),call(b)]);const q=await admin.query("select count(*)::int users from erp.users where company_id=$1 and lower(email)=$2",[tenant,`shared-${i}@example.test`]);const ok=r.filter(x=>x.result?.success).length===1&&r.some(x=>x.result?.code==="EMAIL_CONFLICT")&&!r.some(x=>x.error)&&q.rows[0].users===1;outcomes.push({scenario:"email",i,r,c:q.rows[0],ok});failed||=!ok;
}
for(let i=1;i<=5;i++){
 const operatorId=`M220-CONCURRENT-OP-${i}`;const a=await make({username:`op-a-${i}`,email:`op-a-${i}@example.test`,roleCodes:["operator"],operatorId}),b=await make({username:`op-b-${i}`,email:`op-b-${i}@example.test`,roleCodes:["operator"],operatorId});const r=await Promise.all([call(a),call(b)]);const q=await admin.query("select count(*)::int users from erp.users where company_id=$1 and operator_id=$2",[tenant,operatorId]);const ok=r.filter(x=>x.result?.success).length===1&&r.some(x=>x.result?.code==="OPERATOR_CONFLICT")&&!r.some(x=>x.error)&&q.rows[0].users===1;outcomes.push({scenario:"operator",i,r,c:q.rows[0],ok});failed||=!ok;
}
for(let i=1;i<=10;i++){
 const a=await make({username:`idem-${i}`,email:`idem-${i}@example.test`});a.idempotencyKey=`same-${i}`;const r=await Promise.all([call(a),call({...a})]);const q=await admin.query("select count(*)::int users,(select count(*)::int from erp.user_provisioning_commands where company_id=$1 and idempotency_key=$2) commands,(select count(*)::int from erp.user_roles ur join erp.users u on u.id=ur.user_id where u.company_id=$1 and u.username=$3) roles,(select count(*)::int from erp.audit_log where company_id=$1 and action='USER_CREATED' and new_values->>'username'=$3) created,(select count(*)::int from erp.audit_log where company_id=$1 and action='USER_ROLE_ASSIGNED' and aggregate_id=(select id::text from erp.users where company_id=$1 and username=$3)) role_audits from erp.users where company_id=$1 and username=$3",[tenant,a.idempotencyKey,a.username]);const ids=r.map(x=>x.result?.value?.id).filter(Boolean);const ok=r.every(x=>x.result?.success)&&r.filter(x=>x.result?.replayed===true).length===1&&new Set(ids).size===1&&!r.some(x=>x.error)&&q.rows[0].users===1&&q.rows[0].commands===1&&q.rows[0].roles===1&&q.rows[0].created===1&&q.rows[0].role_audits===1;outcomes.push({scenario:"idempotency-same",i,r,c:q.rows[0],ok});failed||=!ok;
}
for(let i=1;i<=10;i++){
 const key=`mismatch-${i}`,a=await make({username:`mismatch-a-${i}`,email:`mismatch-a-${i}@example.test`,idempotencyKey:key}),b=await make({username:`mismatch-b-${i}`,email:`mismatch-b-${i}@example.test`,idempotencyKey:key});const r=await Promise.all([call(a),call(b)]);const q=await admin.query("select count(*)::int users,(select count(*)::int from erp.user_provisioning_commands where company_id=$1 and idempotency_key=$2) commands,(select count(*)::int from erp.user_roles ur join erp.users u on u.id=ur.user_id where u.company_id=$1 and u.username like $3) roles,(select count(*)::int from erp.audit_log where company_id=$1 and action='USER_CREATED' and new_values->>'username' like $3) created from erp.users where company_id=$1 and username like $3",[tenant,key,`mismatch-%-${i}`]);const ok=r.filter(x=>x.result?.success).length===1&&r.some(x=>x.result?.code==="IDEMPOTENCY_MISMATCH")&&!r.some(x=>x.error)&&q.rows[0].users===1&&q.rows[0].commands===1&&q.rows[0].roles===1&&q.rows[0].created===1;outcomes.push({scenario:"idempotency-mismatch",i,r,c:q.rows[0],ok});failed||=!ok;
}
const scenarios=Object.fromEntries([...new Set(outcomes.map(x=>x.scenario))].map(s=>{const rows=outcomes.filter(x=>x.scenario===s);return[s,{passed:rows.filter(x=>x.ok).length,total:rows.length,codes:[...new Set(rows.flatMap(x=>x.r.map(y=>y.error?"RAW_EXCEPTION":y.result?.code)))],maxMs:Math.max(...rows.flatMap(x=>x.r.map(y=>y.ms))),cardinality:rows.map(x=>x.c)}]}));
const failures=outcomes.filter(x=>!x.ok).map(({scenario,i,r,c})=>({scenario,i,results:r.map(x=>x.error?{error:x.error,ms:x.ms}:{success:x.result?.success,code:x.result?.code,userId:x.result?.value?.id,ms:x.ms}),cardinality:c}));
console.log(JSON.stringify({connectionsPerRace:2,repetitions:{identityConflicts:5,idempotency:10},failed,scenarios,failures},null,2));await admin.end();process.exitCode=failed?1:0;
