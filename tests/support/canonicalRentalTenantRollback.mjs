import pg from "pg";
const { Client } = pg;
const db = new Client({ host: "127.0.0.1", port: 55435, database: process.env.CERT_DB, user: "postgres", password: "postgres" });
const actor = { A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const approver = { A: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", B: "ffffffff-ffff-4fff-8fff-ffffffffffff" };
async function rpc(who, name, command) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]); return (await db.query(`select erp.${name}($1::jsonb) value`, [JSON.stringify(command)])).rows[0].value; }
const command = (type, tenant, rentalId, version, extra = {}) => ({ commandId: `${type}-${tenant}-${rentalId}`, idempotencyKey: `${type}-${tenant}-${rentalId}`, rentalId, expectedVersion: version, ...extra });
const lineTerms = lineId => ({ lineId, commercialTerms: { billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true, transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable" }, costCodeId: "NUMBER-COST", activityCodeId: "NUMBER-ACT", workDescriptionId: "NUMBER-WORK", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-22" }, shiftWindows: [], workDate: "2026-08-22", meterRequirement: "hourMeter" });
async function state(rentalId) { return (await db.query(`select jsonb_build_object('rental',(select to_jsonb(r) from (select status,approval_status,row_version,reserved_at,released_at from erp.rentals where id=$1) r),'lines',(select jsonb_agg(jsonb_build_object('id',id,'status',status,'rowVersion',row_version,'metadata',operational_metadata) order by id) from erp.rental_equipment_lines where rental_id=$1),'contracts',(select count(*) from erp.rental_contracts where rental_id=$1),'snapshots',(select count(*) from erp.commercial_snapshots where rental_id=$1),'audits',(select count(*) from erp.audit_log where aggregate_id=$1),'commands',(select count(*) from erp.operational_command_idempotency where target_aggregate_id=$1 and command_status='COMPLETED')) evidence`, [rentalId])).rows[0].evidence; }
async function rollbackCall(who, name, payload, rentalId, expectedSuccess = true) { const before = await state(rentalId); await db.query("begin"); const result = await rpc(who, name, payload); if (expectedSuccess && !result.success) throw new Error(`${name} rollback setup failed ${JSON.stringify(result)}`); await db.query("rollback"); const after = await state(rentalId); if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${name} left rollback residue ${JSON.stringify({ before, after })}`); return result; }

await db.connect();
try {
  await db.query("insert into erp.cost_codes(id,code,name) values('NUMBER-COST','NUMBER-COST','Number Cost') on conflict(id) do nothing");
  await db.query("insert into erp.activity_codes(id,code,name) values('NUMBER-ACT','NUMBER-ACT','Number Activity') on conflict(id) do nothing");
  await db.query("insert into erp.work_descriptions(id,code,name,requires_remarks) values('NUMBER-WORK','NUMBER-WORK','Number Work',false) on conflict(id) do nothing");
  await db.query("update erp.equipment set cost_code_id='NUMBER-COST' where company_id in('NUMBER-A','NUMBER-B')");
  await db.query("update erp.assignments set activity_code_id='NUMBER-ACT' where company_id in('NUMBER-A','NUMBER-B')");
  for (const tenant of ["A", "B"]) {
    const company = `NUMBER-${tenant}`;
    const values = [approver[tenant], `approver-${tenant.toLowerCase()}@example.test`, `approver.${tenant.toLowerCase()}`, `Approver ${tenant}`, company];
    await db.query("insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing", values.slice(0, 2));
    await db.query("insert into erp.users(id,username,email,display_name,status,company_id) values($1,$3,$2,$4,'active',$5) on conflict(id) do nothing", values);
    await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator' on conflict do nothing", [approver[tenant]]);
  }

  const rentals = { A: "A-RENTAL-01", B: "B-RENTAL-01" };
  const lines = {};
  for (const tenant of ["A", "B"]) lines[tenant] = (await db.query("select id from erp.rental_equipment_lines where rental_id=$1", [rentals[tenant]])).rows[0].id;

  const foreignCreate = await rpc(actor.B, "command_create_draft_rental", { commandId: "FOREIGN-CREATE", idempotencyKey: "FOREIGN-CREATE", customerId: "A-CUSTOMER", projectId: "A-PROJECT", dateOut: "2026-08-22", expectedReturn: "2026-08-23", rentalType: "Operated Rental", lines: [{ assignmentId: "A-ASSIGNMENT-16" }] });
  if (foreignCreate.code !== "NOT_FOUND") throw new Error(`foreign create ${JSON.stringify(foreignCreate)}`);

  const results = {};
  for (const tenant of ["A", "B"]) {
    const other = tenant === "A" ? "B" : "A";
    const termsPayload = command("TERMS", tenant, rentals[tenant], 1, { lines: [lineTerms(lines[tenant])] });
    const crossTerms = await rpc(actor[other], "command_update_draft_rental_terms", { ...termsPayload, commandId: `CROSS-TERMS-${tenant}`, idempotencyKey: `CROSS-TERMS-${tenant}` });
    if (crossTerms.code !== "NOT_FOUND") throw new Error(`cross terms ${JSON.stringify(crossTerms)}`);
    const terms = await rpc(actor[tenant], "command_update_draft_rental_terms", termsPayload);
    if (!terms.success) throw new Error(`tenant terms ${tenant} failed ${JSON.stringify(terms)}`);
    const crossSubmit = await rpc(actor[other], "command_submit_rental_approval", command("CROSS-SUBMIT", tenant, rentals[tenant], terms.value.version));
    if (crossSubmit.code !== "NOT_FOUND") throw new Error(`cross submit ${JSON.stringify(crossSubmit)}`);
    const submit = await rpc(actor[tenant], "command_submit_rental_approval", command("SUBMIT", tenant, rentals[tenant], terms.value.version));
    const crossDecision = await rpc(approver[other], "command_decide_rental_approval", command("CROSS-DECIDE", tenant, rentals[tenant], submit.value.version, { decision: "Approved", remarks: "Cross" }));
    if (crossDecision.code !== "NOT_FOUND") throw new Error(`cross decision ${JSON.stringify(crossDecision)}`);
    const decision = await rpc(approver[tenant], "command_decide_rental_approval", command("DECIDE", tenant, rentals[tenant], submit.value.version, { decision: "Approved", remarks: "Tenant certification" }));
    const crossReserve = await rpc(actor[other], "command_reserve_rental", command("CROSS-RESERVE", tenant, rentals[tenant], decision.value.version));
    if (crossReserve.code !== "NOT_FOUND") throw new Error(`cross reserve ${JSON.stringify(crossReserve)}`);
    const reserve = await rpc(actor[tenant], "command_reserve_rental", command("RESERVE", tenant, rentals[tenant], decision.value.version));
    const crossRelease = await rpc(actor[other], "command_release_rental", command("CROSS-RELEASE", tenant, rentals[tenant], reserve.value.version));
    if (crossRelease.code !== "NOT_FOUND") throw new Error(`cross release ${JSON.stringify(crossRelease)}`);
    const release = await rpc(actor[tenant], "command_release_rental", command("RELEASE", tenant, rentals[tenant], reserve.value.version));
    const replay = await rpc(actor[tenant], "command_release_rental", command("RELEASE", tenant, rentals[tenant], reserve.value.version));
    if (![terms, submit, decision, reserve, release].every(value => value.success) || replay.disposition !== "REPLAYED") throw new Error(`tenant lifecycle ${tenant} failed`);
    results[tenant] = { number: release.value.rentalNumber, id: release.value.rentalId, status: release.value.status };
  }
  if (results.A.number !== results.B.number || results.A.id === results.B.id) throw new Error(`tenant number interference ${JSON.stringify(results)}`);

  const rollbackRental = "A-RENTAL-02";
  const rollbackLine = (await db.query("select id from erp.rental_equipment_lines where rental_id=$1", [rollbackRental])).rows[0].id;
  const sequenceBefore = Number((await db.query("select current_value from erp.number_sequences where company_id='NUMBER-A' and scope='RENTAL' and sequence_year=2026")).rows[0].current_value);
  const draftPayload = { commandId: "ROLLBACK-DRAFT", idempotencyKey: "ROLLBACK-DRAFT", customerId: "A-CUSTOMER", projectId: "A-PROJECT", dateOut: "2026-08-22", expectedReturn: "2026-08-23", rentalType: "Operated Rental", lines: [{ assignmentId: "A-ASSIGNMENT-13" }] };
  await db.query("begin"); const draftRollback = await rpc(actor.A, "command_create_draft_rental", draftPayload); if (!draftRollback.success) throw new Error(`draft rollback call failed ${JSON.stringify(draftRollback)}`); await db.query("rollback");
  const draftResidue = (await db.query("select jsonb_build_object('rental',(select count(*) from erp.rentals where id='ROLLBACK-DRAFT'),'audit',(select count(*) from erp.audit_log where aggregate_id='ROLLBACK-DRAFT'),'command',(select count(*) from erp.operational_command_idempotency where target_aggregate_id='ROLLBACK-DRAFT'),'sequence',(select current_value from erp.number_sequences where company_id='NUMBER-A' and scope='RENTAL' and sequence_year=2026)) e")).rows[0].e;
  if (draftResidue.rental || draftResidue.audit || draftResidue.command || Number(draftResidue.sequence) !== sequenceBefore) throw new Error(`draft rollback residue ${JSON.stringify(draftResidue)}`);

  const termsPayload = command("RB-TERMS", "A", rollbackRental, 1, { lines: [lineTerms(rollbackLine)] });
  await rollbackCall(actor.A, "command_update_draft_rental_terms", termsPayload, rollbackRental);
  const terms = await rpc(actor.A, "command_update_draft_rental_terms", { ...termsPayload, commandId: "SETUP-TERMS", idempotencyKey: "SETUP-TERMS" });
  await rollbackCall(actor.A, "command_submit_rental_approval", command("RB-SUBMIT", "A", rollbackRental, terms.value.version), rollbackRental);
  const submitted = await rpc(actor.A, "command_submit_rental_approval", command("SETUP-SUBMIT", "A", rollbackRental, terms.value.version));
  await rollbackCall(approver.A, "command_decide_rental_approval", command("RB-DECIDE", "A", rollbackRental, submitted.value.version, { decision: "Approved", remarks: "Rollback" }), rollbackRental);
  const decided = await rpc(approver.A, "command_decide_rental_approval", command("SETUP-DECIDE", "A", rollbackRental, submitted.value.version, { decision: "Approved", remarks: "Setup" }));
  await rollbackCall(actor.A, "command_reserve_rental", command("RB-RESERVE", "A", rollbackRental, decided.value.version), rollbackRental);
  const reserved = await rpc(actor.A, "command_reserve_rental", command("SETUP-RESERVE", "A", rollbackRental, decided.value.version));
  await rollbackCall(actor.A, "command_release_rental", command("RB-RELEASE", "A", rollbackRental, reserved.value.version), rollbackRental);

  const audit = (await db.query(`select jsonb_build_object(
    'tenantA',(select count(*) from erp.audit_log where aggregate_id=$1 and action in('RENTAL_DRAFT_CREATED','RENTAL_TERMS_UPDATED','RENTAL_APPROVAL_SUBMITTED','RENTAL_APPROVED','RENTAL_RESERVED','RELEASE_RENTAL')),
    'tenantB',(select count(*) from erp.audit_log where aggregate_id=$2 and action in('RENTAL_DRAFT_CREATED','RENTAL_TERMS_UPDATED','RENTAL_APPROVAL_SUBMITTED','RENTAL_APPROVED','RENTAL_RESERVED','RELEASE_RENTAL')),
    'crossFalseSuccess',(select count(*) from erp.audit_log where correlation_id like 'CROSS-%'),
    'rollbackFalseSuccess',(select count(*) from erp.audit_log where correlation_id like 'RB-%')) evidence`, [rentals.A, rentals.B])).rows[0].evidence;
  if (audit.tenantA !== 6 || audit.tenantB !== 6 || audit.crossFalseSuccess !== 0 || audit.rollbackFalseSuccess !== 0) throw new Error(`audit cardinality ${JSON.stringify(audit)}`);
  console.log(JSON.stringify({ tenantLifecycles: results, foreignCreate: foreignCreate.code, rollback: { draft: "PASS", terms: "PASS", submission: "PASS", decision: "PASS", reserve: "PASS", release: "PASS" }, audit, result: "PASS" }));
} finally { await db.end(); }
