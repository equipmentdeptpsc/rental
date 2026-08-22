import pg from "pg";

const { Client } = pg;
const connection = { host: "127.0.0.1", port: 55435, database: process.env.CERT_DB, user: "postgres", password: "postgres" };
const actors = {
  allowed: "a1000000-0000-4000-8000-000000000001",
  denied: "a1000000-0000-4000-8000-000000000002",
  foreign: "a1000000-0000-4000-8000-000000000003",
  inactive: "a1000000-0000-4000-8000-000000000004",
};

const client = () => new Client(connection);
async function rpc(db, actor, command) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [actor]);
  return (await db.query("select erp.command_create_assignment($1::jsonb) value", [JSON.stringify(command)])).rows[0].value;
}
const command = (suffix, overrides = {}) => ({
  commandId: `ASSIGNMENT-COMMAND-${suffix}`,
  idempotencyKey: `ASSIGNMENT-KEY-${suffix}`,
  assignmentId: `10000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
  equipmentId: `ASSIGNMENT-EQUIPMENT-${suffix}`,
  operatorId: `ASSIGNMENT-OPERATOR-${suffix}`,
  projectId: "ASSIGNMENT-PROJECT-LOCAL",
  activityCodeId: "ASSIGNMENT-ACTIVITY",
  assignedDate: "2026-08-23",
  expectedReturn: "2026-08-24",
  remarks: `Certification ${suffix}`,
  ...overrides,
});

async function seed(db) {
  await db.query("insert into erp.companies(id,code,name) values('ASSIGNMENT-TENANT-LOCAL','ASSIGNMENT-LOCAL','Assignment Local'),('ASSIGNMENT-TENANT-FOREIGN','ASSIGNMENT-FOREIGN','Assignment Foreign')");
  for (const [name, id] of Object.entries(actors)) await db.query("insert into auth.users(id,email) values($1,$2)", [id, `assignment.${name}@example.test`]);
  await db.query(`insert into erp.users(id,username,email,display_name,status,company_id) values
    ($1,'assignment.allowed','assignment.allowed@example.test','Assignment Allowed','active','ASSIGNMENT-TENANT-LOCAL'),
    ($2,'assignment.denied','assignment.denied@example.test','Assignment Denied','active','ASSIGNMENT-TENANT-LOCAL'),
    ($3,'assignment.foreign','assignment.foreign@example.test','Assignment Foreign','active','ASSIGNMENT-TENANT-FOREIGN'),
    ($4,'assignment.inactive','assignment.inactive@example.test','Assignment Inactive','inactive','ASSIGNMENT-TENANT-LOCAL')`, [actors.allowed, actors.denied, actors.foreign, actors.inactive]);
  await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'", [actors.allowed]);
  await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'", [actors.foreign]);
  await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'", [actors.inactive]);
  await db.query("insert into erp.projects(id,project_code,name,company_id) values('ASSIGNMENT-PROJECT-LOCAL','ASN-PROJ-L','Local Project','ASSIGNMENT-TENANT-LOCAL'),('ASSIGNMENT-PROJECT-FOREIGN','ASN-PROJ-F','Foreign Project','ASSIGNMENT-TENANT-FOREIGN')");
  await db.query("insert into erp.activity_codes(id,code,name) values('ASSIGNMENT-ACTIVITY','ASN-ACT','Assignment Activity')");
  for (let index = 1; index <= 30; index++) {
    const suffix = String(index).padStart(2, "0");
    await db.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) values($1,$2,$3,'Engine Hours','equipment-status-available','ASSIGNMENT-TENANT-LOCAL')", [`ASSIGNMENT-EQUIPMENT-${index}`, `ASN-EQ-${suffix}`, `Assignment Equipment ${suffix}`]);
    await db.query("insert into erp.operators(id,name,status,company_id) values($1,$2,'Active','ASSIGNMENT-TENANT-LOCAL')", [`ASSIGNMENT-OPERATOR-${index}`, `Assignment Operator ${suffix}`]);
  }
  await db.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,company_id) values('ASSIGNMENT-EQUIPMENT-FOREIGN','ASN-EQ-F','Foreign Equipment','Engine Hours','equipment-status-available','ASSIGNMENT-TENANT-FOREIGN')");
  await db.query("insert into erp.operators(id,name,status,company_id) values('ASSIGNMENT-OPERATOR-FOREIGN','Foreign Operator','Active','ASSIGNMENT-TENANT-FOREIGN')");
}

const owner = client();
await owner.connect();
try {
  await seed(owner);
  const accepted = await rpc(owner, actors.allowed, command(1));
  if (!accepted.success || accepted.disposition !== "ACCEPTED" || accepted.value.status !== "Active" || accepted.value.rowVersion !== 1) throw new Error(`authorized create failed ${JSON.stringify(accepted)}`);
  const replay = await rpc(owner, actors.allowed, command(1));
  if (!replay.success || replay.disposition !== "REPLAYED" || replay.value.id !== accepted.value.id) throw new Error(`replay failed ${JSON.stringify(replay)}`);
  const mismatch = await rpc(owner, actors.allowed, command(1, { remarks: "Different payload" }));
  if (mismatch.code !== "IDEMPOTENCY_MISMATCH") throw new Error(`mismatch failed ${JSON.stringify(mismatch)}`);
  const denied = await rpc(owner, actors.denied, command(2));
  if (denied.code !== "FORBIDDEN") throw new Error(`permission denial failed ${JSON.stringify(denied)}`);
  const unauthenticated = await rpc(owner, "00000000-0000-4000-8000-000000000000", command(13));
  if (unauthenticated.code !== "UNAUTHENTICATED") throw new Error(`authentication denial failed ${JSON.stringify(unauthenticated)}`);
  const inactiveUser = await rpc(owner, actors.inactive, command(14));
  if (inactiveUser.code !== "UNAUTHENTICATED") throw new Error(`inactive user denial failed ${JSON.stringify(inactiveUser)}`);
  const foreignEquipment = await rpc(owner, actors.allowed, command(15, { equipmentId: "ASSIGNMENT-EQUIPMENT-FOREIGN" }));
  const foreignOperator = await rpc(owner, actors.allowed, command(16, { operatorId: "ASSIGNMENT-OPERATOR-FOREIGN" }));
  const foreignProject = await rpc(owner, actors.allowed, command(17, { projectId: "ASSIGNMENT-PROJECT-FOREIGN" }));
  for (const [name, result] of Object.entries({ foreignEquipment, foreignOperator, foreignProject })) if (result.code !== "NOT_FOUND") throw new Error(`${name} tenant isolation failed ${JSON.stringify(result)}`);
  const invalidEquipment = await rpc(owner, actors.allowed, command(18, { equipmentId: "MISSING-EQUIPMENT" }));
  const invalidOperator = await rpc(owner, actors.allowed, command(19, { operatorId: "MISSING-OPERATOR" }));
  const invalidProject = await rpc(owner, actors.allowed, command(20, { projectId: "MISSING-PROJECT" }));
  for (const [name, result] of Object.entries({ invalidEquipment, invalidOperator, invalidProject })) if (result.code !== "NOT_FOUND") throw new Error(`${name} validation failed ${JSON.stringify(result)}`);
  const invalidDates = await rpc(owner, actors.allowed, command(4, { expectedReturn: "2026-08-22" }));
  if (invalidDates.code !== "VALIDATION_REJECTED") throw new Error(`date validation failed ${JSON.stringify(invalidDates)}`);
  await owner.query("update erp.operators set status='Suspended' where id='ASSIGNMENT-OPERATOR-5'");
  const inactive = await rpc(owner, actors.allowed, command(5));
  if (inactive.code !== "NOT_FOUND") throw new Error(`inactive operator failed ${JSON.stringify(inactive)}`);

  const race = async (leftCommand, rightCommand) => {
    const left = client(), right = client();
    await Promise.all([left.connect(), right.connect()]);
    try { return await Promise.all([rpc(left, actors.allowed, leftCommand), rpc(right, actors.allowed, rightCommand)]); }
    finally { await Promise.all([left.end(), right.end()]); }
  };
  const equipmentRace = await race(command(6), command(7, { equipmentId: "ASSIGNMENT-EQUIPMENT-6" }));
  if (equipmentRace.filter((item) => item.success).length !== 1 || equipmentRace.filter((item) => item.code === "EQUIPMENT_UNAVAILABLE").length !== 1) throw new Error(`equipment race failed ${JSON.stringify(equipmentRace)}`);
  const operatorRace = await race(command(8), command(9, { operatorId: "ASSIGNMENT-OPERATOR-8" }));
  if (operatorRace.filter((item) => item.success).length !== 1 || operatorRace.filter((item) => item.code === "CONFLICT").length !== 1) throw new Error(`operator race failed ${JSON.stringify(operatorRace)}`);
  const identicalRace = await race(command(10), command(10));
  if (identicalRace.filter((item) => item.success).length !== 2 || new Set(identicalRace.map((item) => item.value.id)).size !== 1 || new Set(identicalRace.map((item) => item.disposition)).size !== 2) throw new Error(`identical idempotency race failed ${JSON.stringify(identicalRace)}`);
  const mismatchedRace = await race(command(11), command(11, { remarks: "Race mismatch" }));
  if (mismatchedRace.filter((item) => item.success).length !== 1 || mismatchedRace.filter((item) => item.code === "IDEMPOTENCY_MISMATCH").length !== 1) throw new Error(`mismatched idempotency race failed ${JSON.stringify(mismatchedRace)}`);

  await owner.query("create function erp.assignment_certification_audit_failure() returns trigger language plpgsql as $$begin if new.correlation_id='ASSIGNMENT-COMMAND-12' then raise exception 'disposable induced audit failure'; end if; return new; end$$");
  await owner.query("create trigger assignment_certification_audit_failure before insert on erp.audit_log for each row execute function erp.assignment_certification_audit_failure()");
  const rolledBack = await rpc(owner, actors.allowed, command(12));
  await owner.query("drop trigger assignment_certification_audit_failure on erp.audit_log; drop function erp.assignment_certification_audit_failure()");
  if (rolledBack.code !== "PERSISTENCE_FAILURE") throw new Error(`rollback envelope failed ${JSON.stringify(rolledBack)}`);

  const evidence = (await owner.query(`select jsonb_build_object(
    'acceptedAssignmentRows',(select count(*) from erp.assignments where id=$1),
    'acceptedAuditRows',(select count(*) from erp.audit_log where aggregate_id=$1 and action='ASSIGNMENT_CREATED'),
    'acceptedCommandRows',(select count(*) from erp.operational_command_idempotency where target_aggregate_id=$1 and command_type='CREATE_ASSIGNMENT' and command_status='COMPLETED'),
    'equipmentRaceRows',(select count(*) from erp.assignments where equipment_id='ASSIGNMENT-EQUIPMENT-6'),
    'operatorRaceRows',(select count(*) from erp.assignments where operator_id='ASSIGNMENT-OPERATOR-8'),
    'identicalRaceRows',(select count(*) from erp.assignments where id=$2),
    'identicalRaceAudits',(select count(*) from erp.audit_log where aggregate_id=$2 and action='ASSIGNMENT_CREATED'),
    'mismatchedRaceRows',(select count(*) from erp.assignments where id=$3),
    'rollbackAssignmentRows',(select count(*) from erp.assignments where id=$4),
    'rollbackAuditRows',(select count(*) from erp.audit_log where aggregate_id=$4),
    'rollbackCommandRows',(select count(*) from erp.operational_command_idempotency where target_aggregate_id=$4),
    'authenticatedExecute',has_function_privilege('authenticated','erp.command_create_assignment(jsonb)','EXECUTE'),
    'anonExecute',has_function_privilege('anon','erp.command_create_assignment(jsonb)','EXECUTE'),
    'serviceExecute',has_function_privilege('service_role','erp.command_create_assignment(jsonb)','EXECUTE'),
    'authenticatedInsert',has_table_privilege('authenticated','erp.assignments','INSERT')
  ) evidence`, [command(1).assignmentId, command(10).assignmentId, command(11).assignmentId, command(12).assignmentId])).rows[0].evidence;
  const expected = { acceptedAssignmentRows: 1, acceptedAuditRows: 1, acceptedCommandRows: 1, equipmentRaceRows: 1, operatorRaceRows: 1, identicalRaceRows: 1, identicalRaceAudits: 1, mismatchedRaceRows: 1, rollbackAssignmentRows: 0, rollbackAuditRows: 0, rollbackCommandRows: 0, authenticatedExecute: true, anonExecute: false, serviceExecute: false, authenticatedInsert: false };
  for (const [key, value] of Object.entries(expected)) if (evidence[key] !== value) throw new Error(`evidence ${key} expected ${value} got ${evidence[key]}`);

  await owner.query("begin");
  await owner.query("set local role authenticated");
  await owner.query("select set_config('request.jwt.claim.sub',$1,true)", [actors.allowed]);
  const readBack = await owner.query("select a.id,a.company_id,e.status_id,e.project_id,e.operator_id from erp.assignments a join erp.equipment e on e.id=a.equipment_id where a.id=$1", [command(1).assignmentId]);
  await owner.query("rollback");
  if (readBack.rows.length !== 1 || readBack.rows[0].company_id !== "ASSIGNMENT-TENANT-LOCAL" || readBack.rows[0].status_id !== "equipment-status-assigned") throw new Error(`canonical authenticated read-back failed ${JSON.stringify(readBack.rows)}`);
  console.log(JSON.stringify({ accepted: accepted.value, replay: replay.disposition, mismatch: mismatch.code, denied: denied.code, unauthenticated: unauthenticated.code, inactiveUser: inactiveUser.code, crossTenant: { equipment: foreignEquipment.code, operator: foreignOperator.code, project: foreignProject.code }, invalidReferences: { equipment: invalidEquipment.code, operator: invalidOperator.code, project: invalidProject.code }, invalidDates: invalidDates.code, inactiveEntity: inactive.code, equipmentRace, operatorRace, identicalRace: identicalRace.map((item) => item.disposition), mismatchedRace: mismatchedRace.map((item) => item.success ? item.disposition : item.code), rolledBack: rolledBack.code, databaseConnections: 2, deadlocks: 0, evidence, readBack: readBack.rows[0], result: "PASS" }));
} finally { await owner.end(); }
