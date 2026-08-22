import pg from "pg";
const { Client } = pg;
const connection = { host: "127.0.0.1", port: 55435, database: process.env.CERT_DB, user: "postgres", password: "postgres" };
const actorA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const unprivileged = "33333333-3333-3333-3333-333333333333";
const inactive = "99999999-9999-4999-8999-999999999999";

async function asAuthenticated(actor, sql, values = []) {
  const client = new Client(connection); await client.connect();
  try {
    await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    return await client.query(sql, values);
  } finally { await client.end(); }
}

const owner = new Client(connection); await owner.connect();
try {
  await owner.query("insert into auth.users(id,email) values($1,'inactive-read@example.test') on conflict(id) do nothing", [inactive]);
  await owner.query("insert into erp.users(id,username,email,display_name,status,company_id) values($1,'inactive.read','inactive-read@example.test','Inactive Read','inactive','NUMBER-A') on conflict(id) do nothing", [inactive]);
  await owner.query("insert into erp.cost_codes(id,code,name,active,deleted_at) values('READ-INACTIVE-COST','READ-INACTIVE-COST','Inactive Cost',false,null),('READ-DELETED-COST','READ-DELETED-COST','Deleted Cost',true,clock_timestamp()) on conflict(id) do nothing");
  await owner.query("insert into erp.activity_codes(id,code,name,active,deleted_at) values('READ-INACTIVE-ACT','READ-INACTIVE-ACT','Inactive Activity',false,null),('READ-DELETED-ACT','READ-DELETED-ACT','Deleted Activity',true,clock_timestamp()) on conflict(id) do nothing");

  const draftLine = (await owner.query("select id from erp.rental_equipment_lines where rental_id='A-RENTAL-12'")).rows[0].id;
  const terms = {
    commandId: "READ-DRAFT-TERMS", idempotencyKey: "READ-DRAFT-TERMS", rentalId: "A-RENTAL-12", expectedVersion: 1,
    lines: [{ lineId: draftLine, commercialTerms: { billingMethod: "Per Hour", currency: "PHP", unitRate: 321, operatorIncluded: true, transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable" }, costCodeId: "NUMBER-COST", activityCodeId: "NUMBER-ACT", workDescriptionId: "NUMBER-WORK", deurPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-08-22" }, shiftWindows: [], workDate: "2026-08-22", meterRequirement: "hourMeter" }],
  };
  const updated = (await asAuthenticated(actorA, "select erp.command_update_draft_rental_terms($1::jsonb) value", [JSON.stringify(terms)])).rows[0].value;
  if (!updated.success) throw new Error(`Draft Terms setup failed ${JSON.stringify(updated)}`);

  const draft = (await asAuthenticated(actorA, "select erp.read_canonical_rental_workspace($1) value", ["A-RENTAL-12"])).rows[0].value;
  const reserved = (await asAuthenticated(actorA, "select erp.read_canonical_rental_workspace($1) value", ["A-RENTAL-02"])).rows[0].value;
  const released = (await asAuthenticated("11111111-1111-1111-1111-111111111111", "select erp.read_canonical_rental_workspace($1) value", ["CERT-RENTAL"])).rows[0].value;
  const multi = (await asAuthenticated("11111111-1111-1111-1111-111111111111", "select erp.read_canonical_rental_workspace($1) value", ["EXTENDED-RENTAL-MULTI-5"])).rows[0].value;
  if (draft.contracts.length !== 1 || draft.contracts[0].status !== "Draft" || Number(draft.contracts[0].unitRate) !== 321 || draft.commercialSnapshots.length !== 0) throw new Error(`Draft projection failed ${JSON.stringify(draft)}`);
  if (reserved.contracts.length !== 1 || reserved.contracts[0].status !== "Active" || reserved.commercialSnapshots.length !== 1) throw new Error(`Reserve projection failed ${JSON.stringify(reserved)}`);
  if (released.contracts.length !== 1 || released.contracts[0].status !== "Active" || released.commercialSnapshots.length !== 1) throw new Error(`Release projection failed ${JSON.stringify(released)}`);
  if (multi.contracts.length !== 2 || multi.commercialSnapshots.length !== 2 || new Set(multi.contracts.map(value => value.rentalEquipmentLineId)).size !== 2 || new Set(multi.commercialSnapshots.map(value => value.rentalEquipmentLineId)).size !== 2) throw new Error(`Multi-line projection failed ${JSON.stringify(multi)}`);

  const references = (await asAuthenticated(actorA, "select erp.read_canonical_rental_reference_data() value")).rows[0].value;
  if (!references.costCodes.some(value => value.id === "NUMBER-COST") || !references.activityCodes.some(value => value.id === "NUMBER-ACT") || references.costCodes.some(value => value.id.startsWith("READ-")) || references.activityCodes.some(value => value.id.startsWith("READ-"))) throw new Error(`Reference filtering failed ${JSON.stringify(references)}`);

  const foreign = (await asAuthenticated(actorB, "select erp.read_canonical_rental_workspace($1) value", ["A-RENTAL-02"])).rows[0].value;
  const forbidden = (await asAuthenticated(unprivileged, "select erp.read_canonical_rental_workspace($1) value", ["CERT-RENTAL"])).rows[0].value;
  const inactiveResult = (await asAuthenticated(inactive, "select erp.read_canonical_rental_workspace($1) value", ["A-RENTAL-02"])).rows[0].value;
  const malformed = (await asAuthenticated(actorA, "select erp.read_canonical_rental_workspace(null) value")).rows[0].value;
  if (foreign.code !== "NOT_FOUND" || forbidden.code !== "FORBIDDEN" || inactiveResult.code !== "UNAUTHENTICATED" || malformed.code !== "VALIDATION_REJECTED") throw new Error(`Negative reads failed ${JSON.stringify({ foreign, forbidden, inactiveResult, malformed })}`);

  const privileges = (await owner.query(`select jsonb_build_object(
    'authenticatedWorkspace',has_function_privilege('authenticated','erp.read_canonical_rental_workspace(text)','execute'),
    'authenticatedReferences',has_function_privilege('authenticated','erp.read_canonical_rental_reference_data()','execute'),
    'anonWorkspace',has_function_privilege('anon','erp.read_canonical_rental_workspace(text)','execute'),
    'publicWorkspace',has_function_privilege('public','erp.read_canonical_rental_workspace(text)','execute'),
    'serviceWorkspace',has_function_privilege('service_role','erp.read_canonical_rental_workspace(text)','execute'),
    'authenticatedContractTable',has_table_privilege('authenticated','erp.rental_contracts','select'),
    'authenticatedSnapshotTable',has_table_privilege('authenticated','erp.commercial_snapshots','select'),
    'authenticatedCostTable',has_table_privilege('authenticated','erp.cost_codes','select'),
    'authenticatedActivityTable',has_table_privilege('authenticated','erp.activity_codes','select'),
    'authenticatedContractWrite',has_table_privilege('authenticated','erp.rental_contracts','insert,update,delete'),
    'authenticatedSnapshotWrite',has_table_privilege('authenticated','erp.commercial_snapshots','insert,update,delete')
  ) value`)).rows[0].value;
  if (!privileges.authenticatedWorkspace || !privileges.authenticatedReferences || privileges.anonWorkspace || privileges.publicWorkspace || privileges.serviceWorkspace || privileges.authenticatedContractTable || privileges.authenticatedSnapshotTable || privileges.authenticatedCostTable || privileges.authenticatedActivityTable || privileges.authenticatedContractWrite || privileges.authenticatedSnapshotWrite) throw new Error(`Privilege boundary failed ${JSON.stringify(privileges)}`);

  console.log(JSON.stringify({ draft: { contracts: draft.contracts.length, snapshots: draft.commercialSnapshots.length, status: draft.contracts[0].status }, reserved: { contracts: reserved.contracts.length, snapshots: reserved.commercialSnapshots.length, status: reserved.contracts[0].status }, released: { contracts: released.contracts.length, snapshots: released.commercialSnapshots.length }, multiLine: { contracts: multi.contracts.length, snapshots: multi.commercialSnapshots.length }, references: { costCodes: references.costCodes.length, activityCodes: references.activityCodes.length, inactiveHidden: true }, negatives: { foreign: foreign.code, forbidden: forbidden.code, inactive: inactiveResult.code, malformed: malformed.code }, privileges, result: "PASS" }));
} finally { await owner.end(); }
