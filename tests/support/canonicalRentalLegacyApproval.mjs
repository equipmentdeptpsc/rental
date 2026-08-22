import pg from "pg";
const { Client } = pg;
const client = new Client({ host: "127.0.0.1", port: 55435, database: process.env.CERT_DB ?? "rental_legacy_cert_fresh", user: "postgres", password: "postgres" });
const requester = "11111111-1111-1111-1111-111111111111";

async function rpc(actor, name, command) {
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  return (await client.query(`select erp.${name}($1::jsonb) value`, [JSON.stringify(command)])).rows[0].value;
}

async function prepareLegacy(suffix, marker) {
  const rentalId = `LEGACY-RENTAL-${suffix}`;
  const lineId = `LEGACY-LINE-${suffix}`;
  const equipmentId = `LEGACY-EQUIPMENT-${suffix}`;
  const operatorId = `LEGACY-OPERATOR-${suffix}`;
  const assignmentId = `LEGACY-ASSIGNMENT-${suffix}`;
  await client.query("insert into erp.operators(id,name,status,company_id) values($1,$2,'Active','TENANT-LOCAL-001')", [operatorId, operatorId]);
  await client.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,cost_code_id,company_id) values($1,$2,$2,'Engine Hours',0,'equipment-status-available','CERT-COST','TENANT-LOCAL-001')", [equipmentId, equipmentId]);
  await client.query("insert into erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id) values($1,$2,$3,'CERT-PROJECT','CERT-ACT','2026-08-22','2026-08-23','Active','TENANT-LOCAL-001')", [assignmentId, equipmentId, operatorId]);
  const created = await rpc(requester, "command_create_reserved_rental", { commandId: `LEGACY-CREATE-${suffix}`, idempotencyKey: `LEGACY-CREATE-${suffix}`, rentalId, rentalNumber: `LEGACY-${suffix}`, customerId: "CERT-CUSTOMER", projectId: "CERT-PROJECT", dateOut: "2026-08-22", expectedReturn: "2026-08-23", rentalType: "Operated Rental", lines: [{ id: lineId, equipmentId, assignmentId, operatorId }] });
  if (!created.success) throw new Error(`legacy create failed: ${JSON.stringify(created)}`);
  await client.query("update erp.rentals set commercial_snapshot_required=true,deur_expectation_policy_required=true,deur_expectation_frequency='PER_WORKDAY',deur_expectation_effective_from='2026-08-22',deur_expectation_captured_at=clock_timestamp(),deur_expectation_frozen_at=clock_timestamp(),legacy_payload=case when $3::boolean then jsonb_build_object('approvalStatus','null'::jsonb) when $2::text is null then '{}'::jsonb else jsonb_build_object('approvalStatus',$2::text) end where id=$1", [rentalId, marker === "__JSON_NULL__" ? null : marker, marker === "__JSON_NULL__"]);
  await client.query("insert into erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,operator_included,currency,captured_at,created_by) values($1,$2,$3,'Per Hour',100,true,'PHP',clock_timestamp(),$4)", [`LEGACY-SNAPSHOT-${suffix}`, rentalId, lineId, requester]);
  await client.query(`update erp.rental_equipment_lines set commercial_snapshot_required=true,operational_metadata=jsonb_build_object(
      'costCode',jsonb_build_object('id','CERT-COST','code','CERT-COST','name','Certification Cost'),
      'activityCode',jsonb_build_object('id','CERT-ACT','code','CERT-ACT','name','Certification Activity'),
      'workDescription',jsonb_build_object('id','CERT-WORK','code','CERT-WORK','name','Certification Work','requiresRemarks',false),
      'deurExpectationSnapshot',jsonb_build_object('rentalEquipmentLineId',$2::text,'rentalId',$1::text,'equipmentId',$3::text,'assignmentId',$4::text,'operatorId',$5::text,'projectId','CERT-PROJECT','customerId','CERT-CUSTOMER','policy',jsonb_build_object('frequency','PER_WORKDAY','effectiveFrom','2026-08-22'),'shiftWindows','[]'::jsonb,'workDescription',jsonb_build_object('id','CERT-WORK','code','CERT-WORK','name','Certification Work','requiresRemarks',false),'operationalRemarks',null,'workDateRule','RENTAL_DATE_OUT','workDate','2026-08-22','meterRequirement','none','billingMethod','Per Hour','fuelEvidenceRequired',false,'operationalMetadata',jsonb_build_object('costCode',jsonb_build_object('id','CERT-COST','code','CERT-COST','name','Certification Cost'),'activityCode',jsonb_build_object('id','CERT-ACT','code','CERT-ACT','name','Certification Activity')),'sourceFingerprint','PENDING','capturedAt',clock_timestamp())) where id=$2`, [rentalId, lineId, equipmentId, assignmentId, operatorId]);
  await client.query("update erp.rental_equipment_lines set operational_metadata=jsonb_set(operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(id)),true) where id=$1", [lineId]);
  const row = (await client.query("select row_version,approval_status,not exists(select 1 from erp.audit_log where aggregate_id=$1 and action='RENTAL_DRAFT_CREATED') and not exists(select 1 from erp.operational_command_idempotency where target_aggregate_id=$1 and command_type='CREATE_DRAFT_RENTAL' and command_status='COMPLETED') legacy_branch from erp.rentals where id=$1", [rentalId])).rows[0];
  const readiness = (await client.query("select set_config('request.jwt.claim.sub',$1,false),erp.rental_release_readiness($2) value", [requester, rentalId])).rows[0].value;
  if (!readiness.eligible || row.approval_status !== "NotSubmitted" || !row.legacy_branch) throw new Error(`legacy fixture invalid: ${JSON.stringify({ row, readiness })}`);
  return { rentalId, lineId, version: Number(row.row_version) };
}

await client.connect();
try {
  await client.query("insert into auth.users(id,email) values('33333333-3333-3333-3333-333333333333','legacy.unprivileged@example.test'),('44444444-4444-4444-4444-444444444444','legacy.foreign@example.test') on conflict(id) do nothing");
  await client.query("insert into erp.companies(id,code,name) values('TENANT-FOREIGN-001','LEGACY-FOREIGN','Legacy foreign tenant') on conflict(id) do nothing");
  await client.query("insert into erp.users(id,username,display_name,status,company_id) values('33333333-3333-3333-3333-333333333333','legacy.unprivileged','Legacy Unprivileged','active','TENANT-LOCAL-001'),('44444444-4444-4444-4444-444444444444','legacy.foreign','Legacy Foreign','active','TENANT-FOREIGN-001') on conflict(id) do nothing");
  await client.query("insert into erp.user_roles(user_id,role_id) select '44444444-4444-4444-4444-444444444444',id from erp.app_roles where code='system-administrator' on conflict do nothing");

  const approved = await prepareLegacy("APPROVED-3", "Approved");
  const command = { commandId: "LEGACY-RELEASE-APPROVED-3", idempotencyKey: "LEGACY-RELEASE-APPROVED-3", rentalId: approved.rentalId, expectedVersion: approved.version };
  const unauthorized = await rpc("33333333-3333-3333-3333-333333333333", "command_release_rental", command);
  const crossTenant = await rpc("44444444-4444-4444-4444-444444444444", "command_release_rental", command);
  if (unauthorized.code !== "FORBIDDEN" || crossTenant.code !== "NOT_FOUND") throw new Error(`legacy security failed: ${JSON.stringify({ unauthorized, crossTenant })}`);
  const accepted = await rpc(requester, "command_release_rental", command);
  const replayed = await rpc(requester, "command_release_rental", command);
  const evidence = (await client.query("select r.status,r.row_version,(select count(*)::int from erp.audit_log where aggregate_id=r.id and action='RELEASE_RENTAL') audits,(select count(*)::int from erp.operational_command_idempotency where target_aggregate_id=r.id and command_type='RELEASE_RENTAL' and command_status='COMPLETED') completed from erp.rentals r where r.id=$1", [approved.rentalId])).rows[0];
  if (!accepted.success || accepted.disposition !== "ACCEPTED" || replayed.disposition !== "REPLAYED" || evidence.audits !== 1 || evidence.completed !== 1) throw new Error(`legacy approved/replay failed: ${JSON.stringify({ accepted, replayed, evidence })}`);
  console.log(JSON.stringify({ legacyApproved: "PASS", legacyReplay: "PASS", security: "PASS", evidence }));

  for (const [suffix, marker] of [["REJECTED", "Rejected"], ["MISSING", null], ["NULL", "__JSON_NULL__"], ["UNKNOWN", "Pending"]]) {
    const fixture = await prepareLegacy(suffix, marker);
    const result = await rpc(requester, "command_release_rental", { commandId: `LEGACY-RELEASE-${suffix}`, idempotencyKey: `LEGACY-RELEASE-${suffix}`, rentalId: fixture.rentalId, expectedVersion: fixture.version });
    if (result.code !== "INVALID_TRANSITION") throw new Error(`legacy ${suffix} approval failure: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ legacyMarker: suffix, rejected: "PASS" }));
  }
} finally {
  await client.end();
}
