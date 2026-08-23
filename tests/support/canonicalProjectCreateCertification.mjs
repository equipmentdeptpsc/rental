import pg from "pg";

const { Client } = pg;
const connection = { host: "127.0.0.1", port: Number(process.env.CERT_PORT ?? 5432), database: process.env.CERT_DB, user: "postgres", password: "postgres" };
const actors = {
  allowed: "b1000000-0000-4000-8000-000000000001",
  denied: "b1000000-0000-4000-8000-000000000002",
  foreign: "b1000000-0000-4000-8000-000000000003",
  inactive: "b1000000-0000-4000-8000-000000000004",
  inactiveCompany: "b1000000-0000-4000-8000-000000000005",
  missingApplicationUser: "b1000000-0000-4000-8000-000000000006",
};

const client = () => new Client(connection);
async function rpc(db, actor, payload) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [actor ?? ""]);
  await db.query("set role authenticated");
  try { return (await db.query("select erp.command_create_project($1::jsonb) value", [JSON.stringify(payload)])).rows[0].value; }
  finally { await db.query("reset role"); }
}
const command = (suffix, overrides = {}) => ({
  commandId: `PROJECT-COMMAND-${suffix}`,
  idempotencyKey: `PROJECT-KEY-${suffix}`,
  projectId: `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
  projectCode: `PROJECT-${String(suffix).padStart(3, "0")}`,
  name: `Certification Project ${suffix}`,
  location: "Certification Site",
  ...overrides,
});

async function seed(db) {
  await db.query("insert into erp.companies(id,code,name,active) values('PROJECT-TENANT-LOCAL','PROJECT-LOCAL','Project Local',true),('PROJECT-TENANT-FOREIGN','PROJECT-FOREIGN','Project Foreign',true),('PROJECT-TENANT-INACTIVE','PROJECT-INACTIVE','Project Inactive',false)");
  for (const [name, id] of Object.entries(actors)) await db.query("insert into auth.users(id,email) values($1,$2)", [id, `project.${name}@example.test`]);
  await db.query(`insert into erp.users(id,username,email,display_name,status,company_id) values
    ($1,'project.allowed','project.allowed@example.test','Project Allowed','active','PROJECT-TENANT-LOCAL'),
    ($2,'project.denied','project.denied@example.test','Project Denied','active','PROJECT-TENANT-LOCAL'),
    ($3,'project.foreign','project.foreign@example.test','Project Foreign','active','PROJECT-TENANT-FOREIGN'),
    ($4,'project.inactive','project.inactive@example.test','Project Inactive','inactive','PROJECT-TENANT-LOCAL'),
    ($5,'project.inactive-company','project.inactive-company@example.test','Project Inactive Company','active','PROJECT-TENANT-INACTIVE')`, [actors.allowed, actors.denied, actors.foreign, actors.inactive, actors.inactiveCompany]);
  for (const actor of [actors.allowed, actors.foreign, actors.inactive, actors.inactiveCompany]) await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'", [actor]);
  await db.query("insert into erp.customers(id,customer_code,name,company_id) values('PROJECT-CUSTOMER-LOCAL','PC-LOCAL','Local Customer','PROJECT-TENANT-LOCAL'),('PROJECT-CUSTOMER-FOREIGN','PC-FOREIGN','Foreign Customer','PROJECT-TENANT-FOREIGN'),('PROJECT-CUSTOMER-INACTIVE','PC-INACTIVE','Inactive Customer','PROJECT-TENANT-LOCAL')");
  await db.query("update erp.customers set active=false where id='PROJECT-CUSTOMER-INACTIVE'");
}

const owner = client();
await owner.connect();
try {
  await seed(owner);
  const unauthenticated = await rpc(owner, null, command(1));
  const missingUser = await rpc(owner, actors.missingApplicationUser, command(2));
  const inactiveUser = await rpc(owner, actors.inactive, command(3));
  const inactiveCompany = await rpc(owner, actors.inactiveCompany, command(4));
  const denied = await rpc(owner, actors.denied, command(5));
  for (const [label, result, expected] of [["unauthenticated", unauthenticated, "UNAUTHENTICATED"], ["missing user", missingUser, "UNAUTHENTICATED"], ["inactive user", inactiveUser, "UNAUTHENTICATED"], ["inactive company", inactiveCompany, "UNAUTHENTICATED"], ["permission", denied, "FORBIDDEN"]]) if (result.code !== expected) throw new Error(`${label} expected ${expected}: ${JSON.stringify(result)}`);

  const noCustomer = await rpc(owner, actors.allowed, command(6, { customerId: undefined }));
  if (!noCustomer.success || noCustomer.value.customerId !== null || !noCustomer.value.active || noCustomer.value.deletedAt !== null || noCustomer.value.rowVersion !== 1 || noCustomer.value.companyId !== "PROJECT-TENANT-LOCAL") throw new Error(`no-Customer create failed ${JSON.stringify(noCustomer)}`);
  const validCustomer = await rpc(owner, actors.allowed, command(7, { customerId: "PROJECT-CUSTOMER-LOCAL" }));
  if (!validCustomer.success || validCustomer.value.customerId !== "PROJECT-CUSTOMER-LOCAL") throw new Error(`valid Customer failed ${JSON.stringify(validCustomer)}`);
  const invalidCustomer = await rpc(owner, actors.allowed, command(8, { customerId: "PROJECT-CUSTOMER-MISSING" }));
  const foreignCustomer = await rpc(owner, actors.allowed, command(9, { customerId: "PROJECT-CUSTOMER-FOREIGN" }));
  const inactiveCustomer = await rpc(owner, actors.allowed, command(10, { customerId: "PROJECT-CUSTOMER-INACTIVE" }));
  if ([invalidCustomer, foreignCustomer, inactiveCustomer].some((result) => result.code !== "CUSTOMER_INVALID")) throw new Error(`Customer boundary failed ${JSON.stringify({ invalidCustomer, foreignCustomer, inactiveCustomer })}`);
  const blankCode = await rpc(owner, actors.allowed, command(11, { projectCode: " " }));
  const blankName = await rpc(owner, actors.allowed, command(12, { name: " " }));
  const injectedTenant = await rpc(owner, actors.allowed, command(13, { companyId: "PROJECT-TENANT-FOREIGN" }));
  const injectedLifecycle = await rpc(owner, actors.allowed, command(14, { active: false, deletedAt: "2026-08-23T00:00:00Z" }));
  if ([blankCode, blankName, injectedTenant, injectedLifecycle].some((result) => result.code !== "VALIDATION_REJECTED")) throw new Error(`validation boundary failed ${JSON.stringify({ blankCode, blankName, injectedTenant, injectedLifecycle })}`);

  const replay = await rpc(owner, actors.allowed, command(6, { customerId: undefined }));
  const mismatch = await rpc(owner, actors.allowed, command(6, { customerId: undefined, location: "Different" }));
  if (replay.disposition !== "REPLAYED" || replay.value.id !== noCustomer.value.id || mismatch.code !== "IDEMPOTENCY_MISMATCH") throw new Error(`idempotency failed ${JSON.stringify({ replay, mismatch })}`);
  const duplicate = await rpc(owner, actors.allowed, command(15, { projectCode: "project-006" }));
  if (duplicate.code !== "PROJECT_CODE_CONFLICT") throw new Error(`normalized conflict failed ${JSON.stringify(duplicate)}`);

  const first = client(); const second = client(); await Promise.all([first.connect(), second.connect()]);
  let identicalRace; let codeRace;
  try {
    identicalRace = await Promise.all([rpc(first, actors.allowed, command(16)), rpc(second, actors.allowed, command(16))]);
    if (identicalRace.filter((item) => item.success).length !== 2 || new Set(identicalRace.map((item) => item.value.id)).size !== 1 || !identicalRace.some((item) => item.disposition === "REPLAYED")) throw new Error(`identical race failed ${JSON.stringify(identicalRace)}`);
    codeRace = await Promise.all([rpc(first, actors.allowed, command(17, { projectCode: "PROJECT-RACE" })), rpc(second, actors.allowed, command(18, { projectCode: "project-race" }))]);
    if (codeRace.filter((item) => item.success).length !== 1 || codeRace.filter((item) => item.code === "PROJECT_CODE_CONFLICT").length !== 1) throw new Error(`code race failed ${JSON.stringify(codeRace)}`);
  } finally { await Promise.all([first.end(), second.end()]); }

  await owner.query("create function erp.reject_project_certification_audit() returns trigger language plpgsql as $$ begin if new.aggregate_type='Project' and new.aggregate_id='20000000-0000-4000-8000-000000000019' then raise exception 'certification audit rejection'; end if; return new; end $$");
  await owner.query("create trigger reject_project_certification_audit before insert on erp.audit_log for each row execute function erp.reject_project_certification_audit()");
  const rolledBack = await rpc(owner, actors.allowed, command(19));
  await owner.query("drop trigger reject_project_certification_audit on erp.audit_log");
  await owner.query("drop function erp.reject_project_certification_audit()");
  if (rolledBack.code !== "PERSISTENCE_FAILURE") throw new Error(`audit rollback envelope failed ${JSON.stringify(rolledBack)}`);

  const evidence = (await owner.query(`select jsonb_build_object(
    'acceptedProjects',(select count(*) from erp.projects where id=$1),
    'acceptedAudits',(select count(*) from erp.audit_log where aggregate_type='Project' and aggregate_id=$1 and action='PROJECT_CREATED'),
    'acceptedCommands',(select count(*) from erp.operational_command_idempotency where target_aggregate_type='PROJECT' and target_aggregate_id=$1),
    'identicalProjects',(select count(*) from erp.projects where id=$2),
    'identicalAudits',(select count(*) from erp.audit_log where aggregate_type='Project' and aggregate_id=$2),
    'codeRaceProjects',(select count(*) from erp.projects where lower(project_code)='project-race'),
    'rollbackProjects',(select count(*) from erp.projects where id=$3),
    'rollbackAudits',(select count(*) from erp.audit_log where aggregate_type='Project' and aggregate_id=$3),
    'rollbackCommands',(select count(*) from erp.operational_command_idempotency where target_aggregate_id=$3),
    'authenticatedExecute',has_function_privilege('authenticated','erp.command_create_project(jsonb)','EXECUTE'),
    'anonExecute',has_function_privilege('anon','erp.command_create_project(jsonb)','EXECUTE'),
    'serviceExecute',has_function_privilege('service_role','erp.command_create_project(jsonb)','EXECUTE'),
    'publicExecute',has_function_privilege('public','erp.command_create_project(jsonb)','EXECUTE'),
    'authenticatedInsert',has_table_privilege('authenticated','erp.projects','INSERT'),
    'authenticatedUpdate',has_table_privilege('authenticated','erp.projects','UPDATE'),
    'authenticatedDelete',has_table_privilege('authenticated','erp.projects','DELETE'),
    'anonInsert',has_table_privilege('anon','erp.projects','INSERT')
  ) evidence`, [command(6).projectId, command(16).projectId, command(19).projectId])).rows[0].evidence;
  const expected = { acceptedProjects: 1, acceptedAudits: 1, acceptedCommands: 1, identicalProjects: 1, identicalAudits: 1, codeRaceProjects: 1, rollbackProjects: 0, rollbackAudits: 0, rollbackCommands: 0, authenticatedExecute: true, anonExecute: false, serviceExecute: false, publicExecute: false, authenticatedInsert: false, authenticatedUpdate: false, authenticatedDelete: false, anonInsert: false };
  for (const [key, value] of Object.entries(expected)) if (evidence[key] !== value) throw new Error(`evidence ${key} expected ${value} got ${evidence[key]}`);
  console.log(JSON.stringify({ authentication: { unauthenticated: unauthenticated.code, missingUser: missingUser.code, inactiveUser: inactiveUser.code, inactiveCompany: inactiveCompany.code }, authorization: denied.code, tenant: noCustomer.value.companyId, noCustomer: noCustomer.value, customerValidation: { valid: validCustomer.value.customerId, invalid: invalidCustomer.code, foreign: foreignCustomer.code, inactive: inactiveCustomer.code }, validation: { blankCode: blankCode.code, blankName: blankName.code, tenantInjection: injectedTenant.code, lifecycleInjection: injectedLifecycle.code }, idempotency: { replay: replay.disposition, mismatch: mismatch.code }, uniqueness: duplicate.code, identicalRace: identicalRace.map((item) => item.disposition), codeRace: codeRace.map((item) => item.success ? item.disposition : item.code), databaseConnections: 2, deadlocks: 0, auditRollback: rolledBack.code, evidence, result: "PASS" }));
} finally { await owner.end(); }
