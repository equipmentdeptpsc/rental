import pg from "pg";
const { Client } = pg;
const client = new Client({ host: "127.0.0.1", port: 55435, database: process.env.CERT_DB ?? "rental_release_cert_fresh", user: "postgres", password: "postgres" });
const requester = "11111111-1111-1111-1111-111111111111";
const approver = "22222222-2222-2222-2222-222222222222";

async function rpc(actor, name, command) {
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  return (await client.query(`select erp.${name}($1::jsonb) value`, [JSON.stringify(command)])).rows[0].value;
}

async function prepare(suffix, count) {
  const rentalId = `EXTENDED-RENTAL-${suffix}`;
  const assignments = [];
  for (let index = 1; index <= count; index += 1) {
    const equipmentId = `EXTENDED-EQUIPMENT-${suffix}-${index}`;
    const operatorId = `EXTENDED-OPERATOR-${suffix}-${index}`;
    const assignmentId = `EXTENDED-ASSIGNMENT-${suffix}-${index}`;
    await client.query("insert into erp.operators(id,name,status,company_id) values($1,$2,'Active','TENANT-LOCAL-001')", [operatorId, operatorId]);
    await client.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,cost_code_id,company_id) values($1,$2,$2,'Engine Hours',0,'equipment-status-available','CERT-COST','TENANT-LOCAL-001')", [equipmentId, equipmentId]);
    await client.query("insert into erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id) values($1,$2,$3,'CERT-PROJECT','CERT-ACT','2026-08-22','2026-08-23','Active','TENANT-LOCAL-001')", [assignmentId, equipmentId, operatorId]);
    assignments.push({ assignmentId });
  }
  const created = await rpc(requester, "command_create_draft_rental", { commandId: rentalId, idempotencyKey: `CREATE-${suffix}`, customerId: "CERT-CUSTOMER", projectId: "CERT-PROJECT", dateOut: "2026-08-22", expectedReturn: "2026-08-23", rentalType: "Operated Rental", lines: assignments });
  const termsLines = created.value.lineIds.map(lineId => ({ lineId, commercialTerms: { billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true, transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable" }, costCodeId: "CERT-COST", activityCodeId: "CERT-ACT", workDescriptionId: "CERT-WORK", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-22" }, shiftWindows: [], workDate: "2026-08-22", meterRequirement: "hourMeter" }));
  const terms = await rpc(requester, "command_update_draft_rental_terms", { commandId: `TERMS-${suffix}`, idempotencyKey: `TERMS-${suffix}`, rentalId, expectedVersion: created.value.version, lines: termsLines });
  const submitted = await rpc(requester, "command_submit_rental_approval", { commandId: `SUBMIT-${suffix}`, idempotencyKey: `SUBMIT-${suffix}`, rentalId, expectedVersion: terms.value.version });
  const decided = await rpc(approver, "command_decide_rental_approval", { commandId: `DECIDE-${suffix}`, idempotencyKey: `DECIDE-${suffix}`, rentalId, expectedVersion: submitted.value.version, decision: "Approved", remarks: "Extended certification" });
  const reserved = await rpc(requester, "command_reserve_rental", { commandId: `RESERVE-${suffix}`, idempotencyKey: `RESERVE-${suffix}`, rentalId, expectedVersion: decided.value.version });
  if (!reserved.success) throw new Error(`reserve failed ${suffix}: ${JSON.stringify(reserved)}`);
  return { rentalId, lineIds: created.value.lineIds, version: reserved.value.version };
}

await client.connect();
try {
  const stale = await prepare("STALE-5", 1);
  let readiness = (await client.query("select erp.rental_release_readiness($1) value", [stale.rentalId])).rows[0].value;
  if (!readiness.eligible) throw new Error(`stale fixture not initially fresh: ${JSON.stringify(readiness)}`);
  await client.query("update erp.rental_equipment_lines set operational_metadata=jsonb_set(operational_metadata,'{activityCode,name}',to_jsonb('Changed legitimate metadata'::text),true) where id=$1", [stale.lineIds[0]]);
  readiness = (await client.query("select erp.rental_release_readiness($1) value", [stale.rentalId])).rows[0].value;
  const rejected = await rpc(requester, "command_release_rental", { commandId: "RELEASE-STALE", idempotencyKey: "RELEASE-STALE", rentalId: stale.rentalId, expectedVersion: stale.version });
  if (readiness.eligible || !readiness.reasonCodes.includes("SNAPSHOT_STALE") || rejected.code !== "RELEASE_NOT_READY") throw new Error(`stale protection failed: ${JSON.stringify({ readiness, rejected })}`);
  console.log(JSON.stringify({ staleSnapshot: "PASS", readiness, rejected: rejected.code }));

  const multi = await prepare("MULTI-5", 2);
  const fingerprints = (await client.query("select id,operational_metadata#>>'{deurExpectationSnapshot,sourceFingerprint}' stored,erp.current_deur_expectation_fingerprint(id) recomputed,operational_metadata ?& array['costCode','activityCode','workDescription'] metadata_ready from erp.rental_equipment_lines where rental_id=$1 order by id", [multi.rentalId])).rows;
  readiness = (await client.query("select erp.rental_release_readiness($1) value", [multi.rentalId])).rows[0].value;
  if (fingerprints.length !== 2 || fingerprints.some(row => row.stored !== row.recomputed || !row.metadata_ready) || !readiness.eligible) throw new Error(`multi-line readiness failed: ${JSON.stringify({ fingerprints, readiness })}`);
  const released = await rpc(requester, "command_release_rental", { commandId: "RELEASE-MULTI-5", idempotencyKey: "RELEASE-MULTI-5", rentalId: multi.rentalId, expectedVersion: multi.version });
  if (!released.success || released.value.status !== "Released") throw new Error(`multi-line release failed: ${JSON.stringify(released)}`);
  console.log(JSON.stringify({ multiLineRelease: "PASS", lineCount: fingerprints.length, readiness, released }));

  const partial = await prepare("MULTI-STALE-5", 2);
  await client.query("update erp.rental_equipment_lines set operational_metadata=jsonb_set(operational_metadata,'{activityCode,name}',to_jsonb('Changed one line'::text),true) where id=$1", [partial.lineIds[0]]);
  readiness = (await client.query("select erp.rental_release_readiness($1) value", [partial.rentalId])).rows[0].value;
  const partialRejected = await rpc(requester, "command_release_rental", { commandId: "RELEASE-MULTI-STALE-5", idempotencyKey: "RELEASE-MULTI-STALE-5", rentalId: partial.rentalId, expectedVersion: partial.version });
  if (readiness.eligible || partialRejected.code !== "RELEASE_NOT_READY" || (await client.query("select count(*)::int count from erp.rental_equipment_lines where rental_id=$1 and status='Released'", [partial.rentalId])).rows[0].count !== 0) throw new Error(`multi-line atomic rejection failed: ${JSON.stringify({ readiness, partialRejected })}`);
  console.log(JSON.stringify({ multiLineOneStale: "PASS", readiness, rejected: partialRejected.code }));

  const bypass = await prepare("CANONICAL-LEGACY-BYPASS-3", 1);
  await client.query("update erp.rentals set approval_status='NotSubmitted',approval_requested_at=null,approval_requested_by=null,approval_decided_at=null,approval_decided_by=null,approval_decision_remarks=null,legacy_payload=coalesce(legacy_payload,'{}'::jsonb)||jsonb_build_object('approvalStatus','Approved') where id=$1", [bypass.rentalId]);
  const bypassResult = await rpc(requester, "command_release_rental", { commandId: "RELEASE-CANONICAL-LEGACY-BYPASS-3", idempotencyKey: "RELEASE-CANONICAL-LEGACY-BYPASS-3", rentalId: bypass.rentalId, expectedVersion: 6 });
  if (bypassResult.success) throw new Error(`new canonical Rental bypassed approval through legacy marker: ${JSON.stringify(bypassResult)}`);
  console.log(JSON.stringify({ canonicalLegacyBypassRejected: "PASS", result: bypassResult }));

  for (const state of ["Pending", "Rejected"]) {
    const fixture = await prepare(`CANONICAL-${state.toUpperCase()}`, 1);
    if (state === "Pending") await client.query("update erp.rentals set approval_status='Pending',approval_decided_at=null,approval_decided_by=null,approval_decision_remarks=null,legacy_payload=jsonb_build_object('approvalStatus','Approved') where id=$1", [fixture.rentalId]);
    else await client.query("update erp.rentals set approval_status='Rejected',approval_decision_remarks='Rejected for certification',legacy_payload=jsonb_build_object('approvalStatus','Approved') where id=$1", [fixture.rentalId]);
    const version = Number((await client.query("select row_version from erp.rentals where id=$1", [fixture.rentalId])).rows[0].row_version);
    const result = await rpc(requester, "command_release_rental", { commandId: `RELEASE-CANONICAL-${state}`, idempotencyKey: `RELEASE-CANONICAL-${state}`, rentalId: fixture.rentalId, expectedVersion: version });
    if (result.code !== "INVALID_TRANSITION") throw new Error(`canonical ${state} legacy override not rejected: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ canonicalState: state, legacyApprovedRejected: "PASS" }));
  }

  const canonicalApproved = await prepare("CANONICAL-APPROVED-LEGACY-REJECTED", 1);
  await client.query("update erp.rentals set legacy_payload=jsonb_build_object('approvalStatus','Rejected') where id=$1", [canonicalApproved.rentalId]);
  const approvedVersion = Number((await client.query("select row_version from erp.rentals where id=$1", [canonicalApproved.rentalId])).rows[0].row_version);
  const approvedResult = await rpc(requester, "command_release_rental", { commandId: "RELEASE-CANONICAL-APPROVED-LEGACY-REJECTED", idempotencyKey: "RELEASE-CANONICAL-APPROVED-LEGACY-REJECTED", rentalId: canonicalApproved.rentalId, expectedVersion: approvedVersion });
  if (!approvedResult.success) throw new Error(`canonical Approved was overridden by legacy marker: ${JSON.stringify(approvedResult)}`);
  console.log(JSON.stringify({ canonicalApprovedLegacyRejected: "PASS", result: approvedResult.disposition }));
} finally {
  await client.end();
}
