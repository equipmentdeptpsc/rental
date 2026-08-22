import pg from "pg";
const { Client } = pg;
const client = new Client({ host: "127.0.0.1", port: 55435, database: process.env.CERT_DB ?? "rental_nullsafe_cert_fresh", user: "postgres", password: "postgres" });
const requester = "11111111-1111-1111-1111-111111111111";
async function rpc(actor, name, command) { await client.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]); return (await client.query(`select erp.${name}($1::jsonb) value`,[JSON.stringify(command)])).rows[0].value; }
await client.connect();
try {
  await client.query("insert into erp.operators(id,name,status,company_id) values('TERMS-OP','Terms Operator','Active','TENANT-LOCAL-001'); insert into erp.equipment(id,asset_no,equipment_name,maintenance_type,current_reading,status_id,cost_code_id,company_id) values('TERMS-EQ','TERMS-EQ','Terms Equipment','Engine Hours',0,'equipment-status-available','CERT-COST','TENANT-LOCAL-001'); insert into erp.assignments(id,equipment_id,operator_id,project_id,activity_code_id,assigned_date,expected_return,status,company_id) values('TERMS-ASG','TERMS-EQ','TERMS-OP','CERT-PROJECT','CERT-ACT','2026-08-22','2026-08-23','Active','TENANT-LOCAL-001')");
  const created=await rpc(requester,'command_create_draft_rental',{commandId:'TERMS-NEG-RENTAL',idempotencyKey:'TERMS-NEG-CREATE',customerId:'CERT-CUSTOMER',projectId:'CERT-PROJECT',dateOut:'2026-08-22',expectedReturn:'2026-08-23',rentalType:'Operated Rental',lines:[{assignmentId:'TERMS-ASG'}]});
  const lineId=created.value.lineIds[0];
  const line={lineId,commercialTerms:{billingMethod:'Per Hour',currency:'PHP',unitRate:100,operatorIncluded:true,transactionRelationship:'Non-Affiliate',vatApplicability:'Applicable'},costCodeId:'CERT-COST',activityCodeId:'CERT-ACT',workDescriptionId:'CERT-WORK',deurPolicy:{frequency:'PER_WORKDAY',effectiveFrom:'2026-08-22'},shiftWindows:[],workDate:'2026-08-22',meterRequirement:'hourMeter'};
  const command={commandId:'TERMS-NEG',idempotencyKey:'TERMS-NEG',rentalId:'TERMS-NEG-RENTAL',expectedVersion:1,lines:[line]};
  const unauthorized=await rpc('33333333-3333-3333-3333-333333333333','command_update_draft_rental_terms',command);
  const inactive=await rpc('55555555-5555-5555-5555-555555555555','command_update_draft_rental_terms',command);
  const cross=await rpc('44444444-4444-4444-4444-444444444444','command_update_draft_rental_terms',command);
  const malformed=await rpc(requester,'command_update_draft_rental_terms',{...command,idempotencyKey:'TERMS-MALFORMED',lines:[]});
  const stale=await rpc(requester,'command_update_draft_rental_terms',{...command,idempotencyKey:'TERMS-STALE',expectedVersion:999});
  const prerequisite=await rpc(requester,'command_update_draft_rental_terms',{...command,idempotencyKey:'TERMS-PREREQ',lines:[{...line,costCodeId:'MISSING'}]});
  const wrongLifecycle=await rpc(requester,'command_update_draft_rental_terms',{...command,idempotencyKey:'TERMS-LIFECYCLE',rentalId:'EXTENDED-RENTAL-MULTI-5',expectedVersion:6});
  const actual={unauthorized:unauthorized.code,inactive:inactive.code,cross:cross.code,malformed:malformed.code,stale:stale.code,prerequisite:prerequisite.code,wrongLifecycle:wrongLifecycle.code};
  const expected={unauthorized:'FORBIDDEN',inactive:'FORBIDDEN',cross:'NOT_FOUND',malformed:'VALIDATION_REJECTED',stale:'CONFLICT',prerequisite:'MISSING_RELATIONSHIP',wrongLifecycle:'INVALID_TRANSITION'};
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`Terms negative matrix failed: ${JSON.stringify(actual)}`);
  console.log(JSON.stringify({...actual,termsNegativeMatrix:'PASS'}));
} finally { await client.end(); }
