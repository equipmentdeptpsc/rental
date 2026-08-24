import pg from "pg";
const { Pool }=pg;
const pool=new Pool({connectionString:process.env.LOCAL_DATABASE_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres",max:12});
const actor="64000000-0000-4000-8000-000000000001",tenant="TENANT-WORK-CONC";
const uuid=(group,index,side=1)=>`64${group.toString().padStart(2,"0")}0000-0000-4000-8000-${index.toString().padStart(11,"0")}${side}`.slice(0,36);
async function rpc(command){const client=await pool.connect();try{await client.query("begin");await client.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);const {rows}=await client.query("select erp.command_create_work_description($1::jsonb) value",[JSON.stringify(command)]);await client.query("commit");return rows[0].value;}catch(error){await client.query("rollback");throw error;}finally{client.release();}}
const cmd=(id,key,workDescriptionId,code,name)=>({commandId:id,idempotencyKey:key,workDescriptionId,code,name});
const assertPair=(pair,codes,label)=>{const actual=pair.map(x=>x.success?x.disposition:x.code).sort();const expected=[...codes].sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label}: ${JSON.stringify(actual)}`);};
try{
 await pool.query("insert into erp.companies(id,code,name,active,environment_class) values($1,'WORKCONC','Work Concurrency',true,'test')",[tenant]);
 await pool.query("insert into auth.users(id,email) values($1,'work.concurrent@example.test')",[actor]);
 await pool.query("insert into erp.users(id,username,display_name,email,status,company_id) values($1,'work.concurrent','Work Concurrent','work.concurrent@example.test','active',$2)",[actor,tenant]);
 await pool.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'",[actor]);
 for(let i=1;i<=5;i++){
  const id=uuid(1,i),payload=cmd(`same-${i}`,`same-${i}`,id,`RACE-SAME-${i}`,`Race Same ${i}`);assertPair(await Promise.all([rpc(payload),rpc(payload)]),["ACCEPTED","REPLAYED"],"identical");
  const key=`mismatch-${i}`;assertPair(await Promise.all([rpc(cmd(`mm-a-${i}`,key,uuid(2,i,1),`RACE-MM-A-${i}`,`Race MM A ${i}`)),rpc(cmd(`mm-b-${i}`,key,uuid(2,i,2),`RACE-MM-B-${i}`,`Race MM B ${i}`))]),["ACCEPTED","IDEMPOTENCY_MISMATCH"],"mismatch");
  const duplicateId=uuid(3,i);assertPair(await Promise.all([rpc(cmd(`id-a-${i}`,`id-a-${i}`,duplicateId,`RACE-ID-A-${i}`,`Race ID A ${i}`)),rpc(cmd(`id-b-${i}`,`id-b-${i}`,duplicateId,`RACE-ID-B-${i}`,`Race ID B ${i}`))]),["ACCEPTED","WORK_DESCRIPTION_ID_CONFLICT"],"duplicate id");
  assertPair(await Promise.all([rpc(cmd(`code-a-${i}`,`code-a-${i}`,uuid(4,i,1),` RACE   CODE-${i} `,`Race Code A ${i}`)),rpc(cmd(`code-b-${i}`,`code-b-${i}`,uuid(4,i,2),`race code-${i}`,`Race Code B ${i}`))]),["ACCEPTED","WORK_DESCRIPTION_CODE_CONFLICT"],"normalized code");
  assertPair(await Promise.all([rpc(cmd(`name-a-${i}`,`name-a-${i}`,uuid(5,i,1),`RACE-NAME-A-${i}`,` Race   Name ${i} `)),rpc(cmd(`name-b-${i}`,`name-b-${i}`,uuid(5,i,2),`RACE-NAME-B-${i}`,`race name ${i}`))]),["ACCEPTED","WORK_DESCRIPTION_NAME_CONFLICT"],"normalized name");
 }
 const {rows:[e]}=await pool.query("select (select count(*)::int from erp.work_descriptions where lower(code) like 'race%') work_description_count,(select count(*)::int from erp.audit_log where company_id=$1 and action='WORK_DESCRIPTION_CREATED') audit_count,(select count(*)::int from erp.operational_command_idempotency where company_id=$1 and command_type='CREATE_WORK_DESCRIPTION' and command_status='COMPLETED') command_count,(select count(*)::int from erp.operational_command_idempotency where company_id=$1 and command_type='CREATE_WORK_DESCRIPTION' and command_status<>'COMPLETED') orphan_commands",[tenant]);
 if(e.work_description_count!==25||e.audit_count!==25||e.command_count!==25||e.orphan_commands!==0)throw new Error(`cardinality ${JSON.stringify(e)}`);
 console.log(JSON.stringify({iterations:5,databaseConnections:12,deadlocks:0,...e,result:"PASS"}));
}finally{
 await pool.query("delete from erp.operational_command_idempotency where company_id=$1",[tenant]).catch(()=>{});await pool.query("delete from erp.audit_log where company_id=$1",[tenant]).catch(()=>{});await pool.query("delete from erp.work_descriptions where lower(code) like 'race%'").catch(()=>{});await pool.query("delete from erp.user_roles where user_id=$1",[actor]).catch(()=>{});await pool.query("delete from erp.users where id=$1",[actor]).catch(()=>{});await pool.query("delete from auth.users where id=$1",[actor]).catch(()=>{});await pool.query("delete from erp.companies where id=$1",[tenant]).catch(()=>{});await pool.end();
}
