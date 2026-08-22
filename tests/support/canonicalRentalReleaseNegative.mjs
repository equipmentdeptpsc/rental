import pg from "pg";
const { Client } = pg;
const client = new Client({ host: "127.0.0.1", port: 55435, database: process.env.CERT_DB ?? "rental_nullsafe_cert_fresh", user: "postgres", password: "postgres" });
const requester = "11111111-1111-1111-1111-111111111111";
async function release(actor, command) {
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  return (await client.query("select erp.command_release_rental($1::jsonb) value", [JSON.stringify(command)])).rows[0].value;
}
await client.connect();
try {
  await client.query("insert into auth.users(id,email) values('55555555-5555-5555-5555-555555555555','release.inactive@example.test') on conflict(id) do nothing");
  await client.query("insert into erp.users(id,username,display_name,status,company_id) values('55555555-5555-5555-5555-555555555555','release.inactive','Release Inactive','inactive','TENANT-LOCAL-001') on conflict(id) do nothing");
  await client.query("insert into erp.user_roles(user_id,role_id) select '55555555-5555-5555-5555-555555555555',id from erp.app_roles where code='system-administrator' on conflict do nothing");
  const inactive = await release("55555555-5555-5555-5555-555555555555", { commandId: "NEG-INACTIVE", idempotencyKey: "NEG-INACTIVE", rentalId: "EXTENDED-RENTAL-MULTI-5", expectedVersion: 6 });
  const alreadyReleased = await release(requester, { commandId: "NEG-RELEASED", idempotencyKey: "NEG-RELEASED", rentalId: "EXTENDED-RENTAL-MULTI-5", expectedVersion: 6 });
  if (inactive.code !== "FORBIDDEN" || alreadyReleased.code !== "INVALID_TRANSITION") throw new Error(`actor/lifecycle negative failed: ${JSON.stringify({ inactive, alreadyReleased })}`);

  await client.query("update erp.rentals set legacy_payload=jsonb_build_object('approvalStatus','Approved') where id='LEGACY-RENTAL-REJECTED'");
  await client.query("update erp.rental_equipment_lines set operational_metadata=operational_metadata-'activityCode' where rental_id='LEGACY-RENTAL-REJECTED'");
  let version = Number((await client.query("select row_version from erp.rentals where id='LEGACY-RENTAL-REJECTED'")).rows[0].row_version);
  const missingMetadata = await release(requester, { commandId: "NEG-METADATA", idempotencyKey: "NEG-METADATA", rentalId: "LEGACY-RENTAL-REJECTED", expectedVersion: version });
  if (missingMetadata.code !== "RELEASE_NOT_READY") throw new Error(`missing metadata negative failed: ${JSON.stringify(missingMetadata)}`);

  await client.query("update erp.rentals set legacy_payload=jsonb_build_object('approvalStatus','Approved') where id='LEGACY-RENTAL-UNKNOWN'");
  await client.query("update erp.assignments set status='Completed' where id='LEGACY-ASSIGNMENT-UNKNOWN'");
  version = Number((await client.query("select row_version from erp.rentals where id='LEGACY-RENTAL-UNKNOWN'")).rows[0].row_version);
  const invalidRelationship = await release(requester, { commandId: "NEG-RELATION", idempotencyKey: "NEG-RELATION", rentalId: "LEGACY-RENTAL-UNKNOWN", expectedVersion: version });
  if (invalidRelationship.code !== "RELEASE_NOT_READY") throw new Error(`relationship negative failed: ${JSON.stringify(invalidRelationship)}`);
  console.log(JSON.stringify({ inactive: inactive.code, alreadyReleased: alreadyReleased.code, missingMetadata: missingMetadata.code, invalidRelationship: invalidRelationship.code, releaseNegativeMatrix: "PASS" }));
} finally { await client.end(); }
