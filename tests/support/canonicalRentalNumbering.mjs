import pg from "pg";

const { Client } = pg;
const connection = { host: "127.0.0.1", port: 55435, database: process.env.CERT_DB, user: "postgres", password: "postgres" };
const actors = {
  A: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  C: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  D: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const client = () => new Client(connection);
async function rpc(db, actor, payload) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  return (await db.query("select erp.command_create_draft_rental($1::jsonb) value", [JSON.stringify(payload)])).rows[0].value;
}
const draft = (tenant, suffix, key = suffix) => ({
  commandId: `${tenant}-RENTAL-${suffix}`,
  idempotencyKey: key,
  customerId: `${tenant}-CUSTOMER`,
  projectId: `${tenant}-PROJECT`,
  dateOut: "2026-08-22",
  expectedReturn: "2026-08-23",
  rentalType: "Operated Rental",
  lines: [{ assignmentId: `${tenant}-ASSIGNMENT-${suffix}` }],
});

async function seed(db) {
  await db.query(`insert into erp.app_permissions(id,code,name) values
    ('NUMBER-PERM-RENTAL-MANAGE','rental.manage','Manage Rentals'),
    ('NUMBER-PERM-RENTAL-COMMERCIAL','rental.commercialTerms.manage','Manage Rental Commercial Terms'),
    ('NUMBER-PERM-RENTAL-RELEASE','rental.release','Release Rentals')
    on conflict(code) do nothing`);
  await db.query("insert into erp.role_permissions(role_id,permission_id) select r.id,p.id from erp.app_roles r cross join erp.app_permissions p where r.code='system-administrator' on conflict do nothing");
  for (const tenant of Object.keys(actors)) {
    const company = `NUMBER-${tenant}`;
    await db.query("insert into auth.users(id,email) values($1,$2)", [actors[tenant], `number-${tenant.toLowerCase()}@example.test`]);
    await db.query("insert into erp.companies(id,code,name) values($1,$2,$3)", [company, company, `Numbering ${tenant}`]);
    await db.query("insert into erp.users(id,username,email,display_name,status,company_id) values($1,$2,$3,$4,'active',$5)", [actors[tenant], `number.${tenant.toLowerCase()}`, `number-${tenant.toLowerCase()}@example.test`, `Number ${tenant}`, company]);
    await db.query("insert into erp.user_roles(user_id,role_id) select $1,id from erp.app_roles where code='system-administrator'", [actors[tenant]]);
    await db.query("insert into erp.customers(id,customer_code,name,company_id) values($1,$1,$2,$3)", [`${tenant}-CUSTOMER`, `${tenant} Customer`, company]);
    await db.query("insert into erp.projects(id,project_code,name,customer_id,company_id) values($1,$1,$2,$3,$4)", [`${tenant}-PROJECT`, `${tenant} Project`, `${tenant}-CUSTOMER`, company]);
    for (let index = 1; index <= 16; index++) {
      const suffix = String(index).padStart(2, "0");
      await db.query("insert into erp.operators(id,name,status,company_id) values($1,$2,'Active',$3)", [`${tenant}-OPERATOR-${suffix}`, `${tenant} Operator ${suffix}`, company]);
      await db.query("insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,company_id) values($1,$2,$3,'Engine Hours',0,'equipment-status-available',$4)", [`${tenant}-EQUIPMENT-${suffix}`, `${tenant}-EQ-${suffix}`, `${tenant} Equipment ${suffix}`, company]);
      await db.query("insert into erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) values($1,$2,$3,$4,'2026-08-22','2026-08-23','Active',$5)", [`${tenant}-ASSIGNMENT-${suffix}`, `${tenant}-EQUIPMENT-${suffix}`, `${tenant}-OPERATOR-${suffix}`, `${tenant}-PROJECT`, company]);
    }
  }
}

const owner = client();
await owner.connect();
try {
  await seed(owner);
  const a1 = await rpc(owner, actors.A, draft("A", "01"));
  const a2 = await rpc(owner, actors.A, draft("A", "02"));
  const b1 = await rpc(owner, actors.B, draft("B", "01"));
  if (!a1.success || !a2.success || !b1.success) throw new Error(`sequential create failed ${JSON.stringify({ a1, a2, b1 })}`);
  if (a1.value.rentalNumber !== "RNT-2026-000001" || a2.value.rentalNumber !== "RNT-2026-000002" || b1.value.rentalNumber !== a1.value.rentalNumber) throw new Error("tenant sequence mismatch");

  await owner.query("begin");
  let normalizedRejected = false;
  try { await owner.query("update erp.rentals set rental_number=lower($1) where id=$2", [a1.value.rentalNumber, a2.value.rentalId]); }
  catch (error) { normalizedRejected = error.code === "23505" && error.constraint === "uq_rentals_number"; }
  await owner.query("rollback");
  if (!normalizedRejected) throw new Error("same-company normalized duplicate was not rejected");

  await owner.query("update erp.number_sequences set current_value=0 where company_id='NUMBER-B' and scope='RENTAL' and sequence_year=2026");
  const numberConflict = await rpc(owner, actors.B, draft("B", "02"));
  if (numberConflict.code !== "RENTAL_NUMBER_CONFLICT") throw new Error(`number conflict misclassified ${JSON.stringify(numberConflict)}`);
  const equipmentConflict = await rpc(owner, actors.A, { ...draft("A", "01", "A-EQUIPMENT-CONFLICT"), commandId: "A-EQUIPMENT-CONFLICT" });
  if (equipmentConflict.code !== "EQUIPMENT_UNAVAILABLE") throw new Error(`equipment conflict misclassified ${JSON.stringify(equipmentConflict)}`);
  await owner.query("update erp.number_sequences set current_value=1 where company_id='NUMBER-B' and scope='RENTAL' and sequence_year=2026");

  const sameTenantNumbers = [];
  for (let race = 0; race < 5; race++) {
    const left = client(), right = client(); await Promise.all([left.connect(), right.connect()]);
    try {
      const offset = 3 + race * 2;
      const [one, two] = await Promise.all([
        rpc(left, actors.A, draft("A", String(offset).padStart(2, "0"))),
        rpc(right, actors.A, draft("A", String(offset + 1).padStart(2, "0"))),
      ]);
      if (!one.success || !two.success || one.value.rentalNumber === two.value.rentalNumber) throw new Error(`same-tenant race failed ${JSON.stringify({ one, two })}`);
      sameTenantNumbers.push(one.value.rentalNumber, two.value.rentalNumber);
    } finally { await Promise.all([left.end(), right.end()]); }
  }
  if (new Set(sameTenantNumbers).size !== 10) throw new Error("same-tenant sequence duplicated");

  const crossLeft = client(), crossRight = client(); await Promise.all([crossLeft.connect(), crossRight.connect()]);
  let c1, d1;
  try { [c1, d1] = await Promise.all([rpc(crossLeft, actors.C, draft("C", "01", "SHARED-CROSS-TENANT-KEY")), rpc(crossRight, actors.D, draft("D", "01", "SHARED-CROSS-TENANT-KEY"))]); }
  finally { await Promise.all([crossLeft.end(), crossRight.end()]); }
  if (!c1.success || !d1.success || c1.value.rentalNumber !== "RNT-2026-000001" || d1.value.rentalNumber !== c1.value.rentalNumber || c1.value.rentalId === d1.value.rentalId) throw new Error(`cross-tenant race failed ${JSON.stringify({ c1, d1 })}`);

  const evidence = (await owner.query(`select jsonb_build_object(
    'sameTenantDistinctNumbers',(select count(distinct rental_number) from erp.rentals where company_id='NUMBER-A'),
    'sameTenantRentals',(select count(*) from erp.rentals where company_id='NUMBER-A'),
    'crossTenantSharedNumberCompanies',(select count(distinct company_id) from erp.rentals where rental_number='RNT-2026-000001'),
    'draftAudits',(select count(*) from erp.audit_log where action='RENTAL_DRAFT_CREATED' and company_id like 'NUMBER-%'),
    'completedCommands',(select count(*) from erp.operational_command_idempotency where command_type='CREATE_DRAFT_RENTAL' and command_status='COMPLETED' and company_id like 'NUMBER-%'),
    'failedNumberConflictRows',(select count(*) from erp.rentals where id='B-RENTAL-02'),
    'sequenceRows',(select count(*) from erp.number_sequences where company_id like 'NUMBER-%' and scope='RENTAL')
  ) evidence`)).rows[0].evidence;
  if (evidence.sameTenantDistinctNumbers !== 12 || evidence.sameTenantRentals !== 12 || evidence.crossTenantSharedNumberCompanies !== 4 || evidence.draftAudits !== 15 || evidence.completedCommands !== 15 || evidence.failedNumberConflictRows !== 0 || evidence.sequenceRows !== 4) throw new Error(`cardinality mismatch ${JSON.stringify(evidence)}`);
  console.log(JSON.stringify({ sequential: { a1: a1.value.rentalNumber, a2: a2.value.rentalNumber, b1: b1.value.rentalNumber }, normalizedRejected, numberConflict: numberConflict.code, equipmentConflict: equipmentConflict.code, sameTenantRaces: 5, crossTenantRace: { c: c1.value.rentalNumber, d: d1.value.rentalNumber }, evidence, result: "PASS" }));
} finally { await owner.end(); }
