import pg from "pg";

const { Client } = pg;
const connection = { host: "127.0.0.1", port: 55435, database: process.env.CERT_DB ?? "rental_release_cert_fresh", user: "postgres", password: "postgres" };
const requester = "11111111-1111-1111-1111-111111111111";
const approver = "22222222-2222-2222-2222-222222222222";

async function rpc(client, actor, name, command) {
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  const result = await client.query(`select erp.${name}($1::jsonb) value`, [JSON.stringify(command)]);
  return result.rows[0].value;
}

async function prepare(client, suffix) {
  const rentalId = `CONCURRENT-RENTAL-${suffix}`;
  const equipmentId = `CONCURRENT-EQUIPMENT-${suffix}`;
  const operatorId = `CONCURRENT-OPERATOR-${suffix}`;
  const assignmentId = `CONCURRENT-ASSIGNMENT-${suffix}`;
  await client.query("insert into erp.operators(id,name,status,company_id) values($1,$2,'Active','TENANT-LOCAL-001')", [operatorId, operatorId]);
  await client.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,cost_code_id,company_id) values($1,$2,$2,'Engine Hours',0,'equipment-status-available','CERT-COST','TENANT-LOCAL-001')", [equipmentId, equipmentId]);
  await client.query("insert into erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id) values($1,$2,$3,'CERT-PROJECT','CERT-ACT','2026-08-22','2026-08-23','Active','TENANT-LOCAL-001')", [assignmentId, equipmentId, operatorId]);
  const created = await rpc(client, requester, "command_create_draft_rental", { commandId: rentalId, idempotencyKey: `CREATE-${suffix}`, customerId: "CERT-CUSTOMER", projectId: "CERT-PROJECT", dateOut: "2026-08-22", expectedReturn: "2026-08-23", rentalType: "Operated Rental", lines: [{ assignmentId }] });
  const lineId = created.value.lineIds[0];
  const terms = await rpc(client, requester, "command_update_draft_rental_terms", { commandId: `TERMS-${suffix}`, idempotencyKey: `TERMS-${suffix}`, rentalId, expectedVersion: created.value.version, lines: [{ lineId, commercialTerms: { billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true, transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable" }, costCodeId: "CERT-COST", activityCodeId: "CERT-ACT", workDescriptionId: "CERT-WORK", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-22" }, shiftWindows: [], workDate: "2026-08-22", meterRequirement: "hourMeter" }] });
  const submitted = await rpc(client, requester, "command_submit_rental_approval", { commandId: `SUBMIT-${suffix}`, idempotencyKey: `SUBMIT-${suffix}`, rentalId, expectedVersion: terms.value.version });
  const decided = await rpc(client, approver, "command_decide_rental_approval", { commandId: `DECIDE-${suffix}`, idempotencyKey: `DECIDE-${suffix}`, rentalId, expectedVersion: submitted.value.version, decision: "Approved", remarks: "Concurrency certification" });
  const reserved = await rpc(client, requester, "command_reserve_rental", { commandId: `RESERVE-${suffix}`, idempotencyKey: `RESERVE-${suffix}`, rentalId, expectedVersion: decided.value.version });
  if (!reserved.success || reserved.value.version !== 5) throw new Error(`prepare failed ${suffix}: ${JSON.stringify(reserved)}`);
  return { rentalId, lineId, equipmentId, assignmentId };
}

async function verify(client, fixture) {
  const evidence = await client.query("select r.status,r.row_version,(select count(*)::int from erp.audit_log a where a.aggregate_id=r.id and a.action='RELEASE_RENTAL') audits,(select count(*)::int from erp.operational_command_idempotency i where i.target_aggregate_id=r.id and i.command_type='RELEASE_RENTAL' and i.command_status='COMPLETED') completed,(select status from erp.rental_equipment_lines where id=$2) line_status from erp.rentals r where r.id=$1", [fixture.rentalId, fixture.lineId]);
  const row = evidence.rows[0];
  if (row.status !== "Released" || Number(row.row_version) !== 6 || row.audits !== 1 || row.completed !== 1 || row.line_status !== "Released") throw new Error(`cardinality failure ${fixture.rentalId}: ${JSON.stringify(row)}`);
  return row;
}

const setup = new Client(connection);
const first = new Client(connection);
const second = new Client(connection);
await Promise.all([setup.connect(), first.connect(), second.connect()]);
try {
  await setup.query(`
    insert into auth.users(id,email) values
      ('11111111-1111-1111-1111-111111111111','rental.requester@example.test'),
      ('22222222-2222-2222-2222-222222222222','rental.approver@example.test');
    insert into erp.users(id,username,display_name,status,company_id) values
      ('11111111-1111-1111-1111-111111111111','rental.requester','Rental Requester','active','TENANT-LOCAL-001'),
      ('22222222-2222-2222-2222-222222222222','rental.approver','Rental Approver','active','TENANT-LOCAL-001');
    insert into erp.app_permissions(id,code,name) values
      ('CERT-PERM-RENTAL-MANAGE','rental.manage','Manage Rentals'),
      ('CERT-PERM-RENTAL-COMMERCIAL','rental.commercialTerms.manage','Manage Rental Commercial Terms'),
      ('CERT-PERM-RENTAL-RELEASE','rental.release','Release Rentals') on conflict(code) do nothing;
    insert into erp.role_permissions(role_id,permission_id) select r.id,p.id from erp.app_roles r cross join erp.app_permissions p where r.code='system-administrator' on conflict do nothing;
    insert into erp.user_roles(user_id,role_id) select '11111111-1111-1111-1111-111111111111',id from erp.app_roles where code='system-administrator';
    insert into erp.user_roles(user_id,role_id) select '22222222-2222-2222-2222-222222222222',id from erp.app_roles where code='system-administrator';
    insert into erp.cost_codes(id,code,name) values('CERT-COST','CERT-COST','Certification Cost');
    insert into erp.activity_codes(id,code,name) values('CERT-ACT','CERT-ACT','Certification Activity');
    insert into erp.work_descriptions(id,code,name,requires_remarks) values('CERT-WORK','CERT-WORK','Certification Work',false);
    insert into erp.customers(id,customer_code,name,company_id) values('CERT-CUSTOMER','CERT-CUSTOMER','Certification Customer','TENANT-LOCAL-001');
    insert into erp.projects(id,project_code,name,customer_id,company_id) values('CERT-PROJECT','CERT-PROJECT','Certification Project','CERT-CUSTOMER','TENANT-LOCAL-001');
  `);
  for (const scenario of ["identical", "mismatch", "different-keys"]) {
    for (let repetition = 1; repetition <= 5; repetition += 1) {
      const suffix = `${scenario}-${repetition}`;
      const fixture = await prepare(setup, suffix);
      const base = { commandId: `RELEASE-${suffix}`, idempotencyKey: `RELEASE-${suffix}`, rentalId: fixture.rentalId, expectedVersion: 5 };
      let left;
      let right;
      if (scenario === "identical") [left, right] = await Promise.all([rpc(first, requester, "command_release_rental", base), rpc(second, requester, "command_release_rental", base)]);
      if (scenario === "mismatch") [left, right] = await Promise.all([rpc(first, requester, "command_release_rental", base), rpc(second, requester, "command_release_rental", { ...base, clientReference: "different" })]);
      if (scenario === "different-keys") [left, right] = await Promise.all([rpc(first, requester, "command_release_rental", base), rpc(second, requester, "command_release_rental", { ...base, commandId: `${base.commandId}-B`, idempotencyKey: `${base.idempotencyKey}-B` })]);
      const labels = [left.disposition ?? left.code, right.disposition ?? right.code].sort();
      if (scenario === "identical" && JSON.stringify(labels) !== JSON.stringify(["ACCEPTED", "REPLAYED"])) throw new Error(`${suffix}: ${JSON.stringify([left, right])}`);
      if (scenario === "mismatch" && JSON.stringify(labels) !== JSON.stringify(["ACCEPTED", "IDEMPOTENCY_MISMATCH"])) throw new Error(`${suffix}: ${JSON.stringify([left, right])}`);
      if (scenario === "different-keys" && !(labels.includes("ACCEPTED") && (labels.includes("CONFLICT") || labels.includes("INVALID_TRANSITION")))) throw new Error(`${suffix}: ${JSON.stringify([left, right])}`);
      const evidence = await verify(setup, fixture);
      console.log(JSON.stringify({ scenario, repetition, left: left.disposition ?? left.code, right: right.disposition ?? right.code, evidence }));
    }
  }
} finally {
  await Promise.all([setup.end(), first.end(), second.end()]);
}
