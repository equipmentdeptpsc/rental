import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { assertSupabaseFixtureMutationAllowed,createSupabasePhaseC2Harness,readSupabasePhaseC2TestConfiguration } from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";
import { executeParallelCommandRace } from "./support/parallelCommandRace";

const configuration=readSupabasePhaseC2TestConfiguration();
const enabled=configuration.enabled&&process.env.RUN_PHASE_C733_LIVE==="true";
const tenant="TENANT-UAT-C7-RELEASE-001";
const authorizedEmail="c733-release-authorized@example.invalid";
const operatorBEmail="c733-release-operator-b@example.invalid";
const unauthorizedEmail="c733-release-unauthorized@example.invalid";

describe.skipIf(!enabled)("Phase C7.3.3 live release gate",()=>{
  const harness=enabled?createSupabasePhaseC2Harness(configuration):undefined;
  const password=`C733-${randomBytes(24).toString("base64url")}`;
  const authIds:string[]=[];
  let authorized!:SupabaseClient; let operatorB!:SupabaseClient; let unauthorized!:SupabaseClient;
  const clients:SupabaseClient[]=[];
  const owner=(sql:string)=>executePhaseC4bPrivilegedSql(configuration,{tenantIds:[tenant],sql});
  const cleanup=()=>owner(`SELECT erp.cleanup_c7_release_certification_fixture('${tenant}','${tenant}','CONFIRM-C7-RELEASE-CLEANUP');`);
  const client=()=>{const value=createClient(configuration.url!,configuration.publishableKey!,{auth:{persistSession:false,autoRefreshToken:false,storageKey:`c733-${randomBytes(6).toString("hex")}`}});clients.push(value);return value;};
  const release=(rpcClient:SupabaseClient,rentalId:string,idempotencyKey:string,expectedVersion=1,extra:Record<string,unknown>={})=>rpcClient.schema("erp").rpc("command_release_rental",{command:{commandId:`CMD-${idempotencyKey}`,idempotencyKey,rentalId,expectedVersion,...extra}});

  beforeAll(async()=>{
    assertSupabaseFixtureMutationAllowed(configuration,[tenant]);
    expect(process.env.VITE_REMOTE_OPERATIONAL_WRITES_ENABLED).toBe("false");
    cleanup();
    const listed=await harness!.admin.auth.admin.listUsers({page:1,perPage:1000});if(listed.error)throw listed.error;
    for(const user of listed.data.users.filter(u=>[authorizedEmail,operatorBEmail,unauthorizedEmail].includes(u.email??""))){const removed=await harness!.admin.auth.admin.deleteUser(user.id);if(removed.error)throw removed.error;}
    for(const email of [authorizedEmail,operatorBEmail,unauthorizedEmail]){const created=await harness!.admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error||!created.data.user)throw created.error??new Error("Auth fixture creation failed.");authIds.push(created.data.user.id);}
    owner(`
      BEGIN;
      INSERT INTO erp.companies(id,code,name,environment_class) VALUES('${tenant}','${tenant}','C7 Release Certification','test');
      INSERT INTO erp.operators(id,name,status,company_id) VALUES
        ('OPR-UAT-C7-RELEASE-A','Release Operator A','Active','${tenant}'),('OPR-UAT-C7-RELEASE-B','Release Operator B','Active','${tenant}');
      INSERT INTO erp.users(id,username,display_name,status,operator_id,company_id) VALUES
        ('${authIds[0]}'::uuid,'c733-release-authorized','Release Authorized','active','OPR-UAT-C7-RELEASE-A','${tenant}'),
        ('${authIds[1]}'::uuid,'c733-release-operator-b','Release Operator B','active','OPR-UAT-C7-RELEASE-B','${tenant}'),
        ('${authIds[2]}'::uuid,'c733-release-unauthorized','Release Unauthorized','active',NULL,'${tenant}');
      INSERT INTO erp.user_roles(user_id,role_id)
        SELECT actor,id FROM (VALUES('${authIds[0]}'::uuid),('${authIds[1]}'::uuid)) actors(actor)
        CROSS JOIN erp.app_roles WHERE code='rental-operations';
      INSERT INTO erp.customers(id,customer_code,name,company_id) VALUES('CUST-UAT-C7-RELEASE-001','C7-RELEASE','Release Customer','${tenant}');
      INSERT INTO erp.projects(id,project_code,name,customer_id,company_id) VALUES('PRJ-UAT-C7-RELEASE-001','C7-RELEASE','Release Project','CUST-UAT-C7-RELEASE-001','${tenant}');
      INSERT INTO erp.equipment_statuses(id,code,name,active) VALUES
        ('REF-UAT-C7-RELEASE-ASSIGNED','assigned','C7 Assigned',true),('REF-UAT-C7-RELEASE-RENTED','rented','C7 Rented',true);
      INSERT INTO erp.equipment(id,asset_no,equipment_name,maintenance_type,status_id,project_id,operator_id,company_id) VALUES
        ('EQP-UAT-C7-RELEASE-A','C7-REL-A','Release Equipment A','None','REF-UAT-C7-RELEASE-ASSIGNED','PRJ-UAT-C7-RELEASE-001','OPR-UAT-C7-RELEASE-A','${tenant}'),
        ('EQP-UAT-C7-RELEASE-B','C7-REL-B','Release Equipment B','None','REF-UAT-C7-RELEASE-ASSIGNED','PRJ-UAT-C7-RELEASE-001','OPR-UAT-C7-RELEASE-B','${tenant}');
      INSERT INTO erp.assignments(id,equipment_id,operator_id,project_id,assigned_date,expected_return,status,company_id) VALUES
        ('ASN-UAT-C7-RELEASE-A','EQP-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A','PRJ-UAT-C7-RELEASE-001',current_date,current_date+30,'Active','${tenant}'),
        ('ASN-UAT-C7-RELEASE-B','EQP-UAT-C7-RELEASE-B','OPR-UAT-C7-RELEASE-B','PRJ-UAT-C7-RELEASE-001',current_date,current_date+30,'Active','${tenant}');
      INSERT INTO erp.rentals(id,rental_number,customer_id,project_id,customer_snapshot,project_snapshot,date_out,rental_type,status,deur_expectation_frequency,deur_expectation_effective_from,legacy_payload,company_id) VALUES
        ('RENT-UAT-C7-RELEASE-A','C7-REL-A','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}'),
        ('RENT-UAT-C7-RELEASE-B','C7-REL-B','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}'),
        ('RENT-UAT-C7-RELEASE-C','C7-REL-C','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}'),
        ('RENT-UAT-C7-RELEASE-D','C7-REL-D','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}'),
        ('RENT-UAT-C7-RELEASE-E','C7-REL-E','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}'),
        ('RENT-UAT-C7-RELEASE-F','C7-REL-F','CUST-UAT-C7-RELEASE-001','PRJ-UAT-C7-RELEASE-001','Customer','Project',current_date,'Operated Rental','Reserved','ON_DEMAND',current_date,'{"approvalStatus":"Approved"}','${tenant}');
      WITH source(id,rental_id,equipment_id,assignment_id,operator_id,complete) AS (VALUES
        ('LINE-UAT-C7-RELEASE-A','RENT-UAT-C7-RELEASE-A','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',false),
        ('LINE-UAT-C7-RELEASE-B1','RENT-UAT-C7-RELEASE-B','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',true),
        ('LINE-UAT-C7-RELEASE-B2','RENT-UAT-C7-RELEASE-B','EQP-UAT-C7-RELEASE-B','ASN-UAT-C7-RELEASE-B','OPR-UAT-C7-RELEASE-B',false),
        ('LINE-UAT-C7-RELEASE-C1','RENT-UAT-C7-RELEASE-C','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',true),
        ('LINE-UAT-C7-RELEASE-C2','RENT-UAT-C7-RELEASE-C','EQP-UAT-C7-RELEASE-B','ASN-UAT-C7-RELEASE-B','OPR-UAT-C7-RELEASE-B',true),
        ('LINE-UAT-C7-RELEASE-D','RENT-UAT-C7-RELEASE-D','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',true),
        ('LINE-UAT-C7-RELEASE-E','RENT-UAT-C7-RELEASE-E','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',true),
        ('LINE-UAT-C7-RELEASE-F','RENT-UAT-C7-RELEASE-F','EQP-UAT-C7-RELEASE-A','ASN-UAT-C7-RELEASE-A','OPR-UAT-C7-RELEASE-A',true)
      ) INSERT INTO erp.rental_equipment_lines(id,rental_id,equipment_id,assignment_id,operator_id,status,operational_metadata,commercial_snapshot_required,company_id)
      SELECT id,rental_id,equipment_id,assignment_id,operator_id,'Reserved',
        jsonb_build_object('costCode',jsonb_build_object('code','C7-COST'),'activityCode',jsonb_build_object('code','C7-ACT'))||
        CASE WHEN complete THEN jsonb_build_object('deurExpectationSnapshot',jsonb_build_object(
          'rentalEquipmentLineId',id,'rentalId',rental_id,'equipmentId',equipment_id,'assignmentId',assignment_id,'operatorId',operator_id,
          'projectId','PRJ-UAT-C7-RELEASE-001','customerId','CUST-UAT-C7-RELEASE-001','policy',jsonb_build_object('frequency','ON_DEMAND'),'shiftWindows','[]'::jsonb,
          'workDescription',jsonb_build_object('id','WORK-UAT-C7-RELEASE','code','C7-WORK','name','Release work','requiresRemarks',false),
          'workDateRule','RENTAL_DATE_OUT','workDate',current_date::text,'meterRequirement','none','fuelEvidenceRequired',false,'billingMethod','Per Hour',
          'operationalMetadata',jsonb_build_object('costCode',jsonb_build_object('code','C7-COST'),'activityCode',jsonb_build_object('code','C7-ACT')),
          'sourceFingerprint','C7-CURRENT')) ELSE '{}'::jsonb END,
        true,'${tenant}' FROM source;
      INSERT INTO erp.commercial_snapshots(id,rental_id,rental_equipment_line_id,billing_method,unit_rate,minimum_billable_hours,standby_rate,mobilization_fee,demobilization_fee,fuel_charge,operator_included,operator_rate,tax_rate,withholding_tax,currency,captured_at)
      SELECT 'SNAP-'||id,rental_id,id,'Per Hour',100,0,0,0,0,0,true,0,0,0,'PHP',clock_timestamp()
      FROM erp.rental_equipment_lines WHERE company_id='${tenant}';
      UPDATE erp.rental_equipment_lines l SET operational_metadata=jsonb_set(l.operational_metadata,'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(l.id)),true)
      WHERE l.company_id='${tenant}' AND l.operational_metadata ? 'deurExpectationSnapshot';
      COMMIT;
    `);
    authorized=client();operatorB=client();unauthorized=client();
    for(const [c,email] of [[authorized,authorizedEmail],[operatorB,operatorBEmail],[unauthorized,unauthorizedEmail]] as const){const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;}
  },90_000);

  afterAll(async()=>{
    await Promise.allSettled(clients.map(c=>c.auth.signOut()));
    try{cleanup();}catch{/* retain original failure */}
    for(const id of authIds)await harness!.admin.auth.admin.deleteUser(id);
    try{cleanup();}catch{/* retain original failure */}
  },90_000);

  it("rejects incomplete single and multi-line rentals without partial mutation",async()=>{
    const a=await release(authorized,"RENT-UAT-C7-RELEASE-A","C733-A");expect(a.error).toBeNull();expect(a.data).toMatchObject({success:false,code:"RELEASE_NOT_READY"});expect(JSON.stringify(a.data)).toContain("LINE-UAT-C7-RELEASE-A");expect(JSON.stringify(a.data)).toContain("snapshot");
    const b=await release(authorized,"RENT-UAT-C7-RELEASE-B","C733-B");expect(b.error).toBeNull();expect(b.data).toMatchObject({success:false,code:"RELEASE_NOT_READY"});expect(JSON.stringify(b.data)).toContain("LINE-UAT-C7-RELEASE-B2");
    owner(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM erp.rentals WHERE id IN('RENT-UAT-C7-RELEASE-A','RENT-UAT-C7-RELEASE-B') AND status<>'Reserved') THEN RAISE EXCEPTION 'partial rental release'; END IF;
      IF EXISTS(SELECT 1 FROM erp.rental_equipment_lines WHERE rental_id IN('RENT-UAT-C7-RELEASE-A','RENT-UAT-C7-RELEASE-B') AND status<>'Reserved') THEN RAISE EXCEPTION 'partial line release'; END IF;
      IF EXISTS(SELECT 1 FROM erp.audit_log WHERE company_id='${tenant}' AND action='RELEASE_RENTAL') THEN RAISE EXCEPTION 'unexpected release audit'; END IF;
      IF EXISTS(SELECT 1 FROM erp.operational_command_idempotency WHERE company_id='${tenant}') THEN RAISE EXCEPTION 'unexpected completed command'; END IF;
      IF EXISTS(SELECT 1 FROM erp.deurs WHERE company_id='${tenant}') THEN RAISE EXCEPTION 'unexpected DEUR'; END IF;
    END $$;`);
  });

  it("rejects a released line with no frozen expectation without persistence side effects",async()=>{
    owner(`UPDATE erp.rentals SET status='Released' WHERE id='RENT-UAT-C7-RELEASE-A'; UPDATE erp.rental_equipment_lines SET status='Released' WHERE id='LINE-UAT-C7-RELEASE-A';`);
    const result=await authorized.schema("erp").rpc("command_start_deur_shift",{command:{commandId:"CMD-C734-MISSING",idempotencyKey:"IDEM-C734-MISSING",rentalId:"RENT-UAT-C7-RELEASE-A",rentalLineId:"LINE-UAT-C7-RELEASE-A",equipmentId:"EQP-UAT-C7-RELEASE-A",assignmentId:"ASN-UAT-C7-RELEASE-A",operatorId:"OPR-UAT-C7-RELEASE-A",deviceId:"C734",draft:{id:"DEUR-UAT-C7-RELEASE-MISSING"}}});
    expect(result.error).toBeNull();expect(result.data).toMatchObject({success:false,code:"DEUR_EXPECTATION_REQUIRED"});
    owner(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM erp.deurs WHERE id='DEUR-UAT-C7-RELEASE-MISSING') THEN RAISE EXCEPTION 'missing snapshot DEUR persisted'; END IF;
      IF EXISTS(SELECT 1 FROM erp.deur_events WHERE deur_id='DEUR-UAT-C7-RELEASE-MISSING') THEN RAISE EXCEPTION 'missing snapshot event persisted'; END IF;
      IF EXISTS(SELECT 1 FROM erp.audit_log WHERE aggregate_id='DEUR-UAT-C7-RELEASE-MISSING') THEN RAISE EXCEPTION 'missing snapshot success audit persisted'; END IF;
    END $$;`);
  },20_000);

  it("releases two complete lines once and enforces replay and payload mismatch",async()=>{
    const accepted=await release(authorized,"RENT-UAT-C7-RELEASE-C","C733-C");expect(accepted.error).toBeNull();expect(accepted.data).toMatchObject({success:true,disposition:"ACCEPTED",value:{status:"Released"}});
    const replay=await release(authorized,"RENT-UAT-C7-RELEASE-C","C733-C");expect(replay.error).toBeNull();expect(replay.data).toMatchObject({success:true,disposition:"REPLAYED"});
    const mismatch=await release(authorized,"RENT-UAT-C7-RELEASE-C","C733-C",1,{certificationVariant:"changed"});expect(mismatch.error).toBeNull();expect(mismatch.data).toMatchObject({success:false,code:"IDEMPOTENCY_MISMATCH"});
    owner(`DO $$ BEGIN
      IF (SELECT status FROM erp.rentals WHERE id='RENT-UAT-C7-RELEASE-C')<>'Released' THEN RAISE EXCEPTION 'rental not released'; END IF;
      IF (SELECT count(*) FROM erp.rental_equipment_lines WHERE rental_id='RENT-UAT-C7-RELEASE-C' AND status='Released')<>2 THEN RAISE EXCEPTION 'lines not atomic'; END IF;
      IF (SELECT count(*) FROM erp.equipment e JOIN erp.equipment_statuses s ON s.id=e.status_id WHERE e.company_id='${tenant}' AND lower(s.code)='rented')<>2 THEN RAISE EXCEPTION 'equipment not transitioned'; END IF;
      IF (SELECT count(*) FROM erp.assignments WHERE company_id='${tenant}' AND status='Active')<>2 THEN RAISE EXCEPTION 'assignments changed'; END IF;
      IF (SELECT count(*) FROM erp.audit_log WHERE company_id='${tenant}' AND action='RELEASE_RENTAL')<>1 THEN RAISE EXCEPTION 'release audit count'; END IF;
      IF (SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='${tenant}' AND command_type='RELEASE_RENTAL')<>1 THEN RAISE EXCEPTION 'release command count'; END IF;
    END $$;`);
  });

  it("rejects a stale protected source, ignores capture time and accepts regeneration",async()=>{
    owner(`UPDATE erp.rental_equipment_lines SET operational_metadata=jsonb_set(operational_metadata,'{costCode,code}','\"C7-CHANGED\"'::jsonb) WHERE id='LINE-UAT-C7-RELEASE-D';`);
    const stale=await authorized.schema("erp").rpc("rental_release_readiness",{target_rental_id:"RENT-UAT-C7-RELEASE-D"});expect(stale.error).toBeNull();expect(stale.data).toMatchObject({eligible:false,reasonCodes:["RELEASE_NOT_READY","SNAPSHOT_STALE"]});expect(stale.data.incompleteEquipmentLines[0]).toMatchObject({snapshotFreshness:false,reasonCode:"SNAPSHOT_STALE"});
    owner(`UPDATE erp.rental_equipment_lines l SET operational_metadata=jsonb_set(jsonb_set(operational_metadata,'{deurExpectationSnapshot,capturedAt}',to_jsonb(clock_timestamp()),true),'{deurExpectationSnapshot,sourceFingerprint}',to_jsonb(erp.current_deur_expectation_fingerprint(l.id)),true) WHERE id='LINE-UAT-C7-RELEASE-D';`);
    const restored=await release(authorized,"RENT-UAT-C7-RELEASE-D","C733-D-RESTORED");expect(restored.error).toBeNull();expect(restored.data).toMatchObject({success:true,disposition:"ACCEPTED"});
  },20_000);

  it("runs genuine identical and stale-version release races without duplicate state",async()=>{
    const a=client(),b=client();for(const c of [a,b]){const login=await c.auth.signInWithPassword({email:authorizedEmail,password});if(login.error)throw login.error;}
    const same={commandId:"CMD-C733-RACE-A",idempotencyKey:"C733-RACE-A",rentalId:"RENT-UAT-C7-RELEASE-E",expectedVersion:1};
    const raceA=await executeParallelCommandRace({clientA:a,clientB:b,rpcA:"command_release_rental",commandA:same,commandB:same});expect(raceA.releaseSkewMs).toBeLessThan(100);expect(raceA.overlapped).toBe(true);expect(raceA.deadlock).toBe(false);expect([raceA.a.data?.disposition,raceA.b.data?.disposition].sort()).toEqual(["ACCEPTED","REPLAYED"]);
    const raceB=await executeParallelCommandRace({clientA:a,clientB:b,rpcA:"command_release_rental",commandA:{commandId:"CMD-C733-RACE-B-WIN",idempotencyKey:"C733-RACE-B-WIN",rentalId:"RENT-UAT-C7-RELEASE-F",expectedVersion:1},commandB:{commandId:"CMD-C733-RACE-B-STALE",idempotencyKey:"C733-RACE-B-STALE",rentalId:"RENT-UAT-C7-RELEASE-F",expectedVersion:0}});expect(raceB.releaseSkewMs).toBeLessThan(100);expect(raceB.deadlock).toBe(false);expect([raceB.a.data?.code??raceB.a.data?.disposition,raceB.b.data?.code??raceB.b.data?.disposition].sort()).toEqual(["ACCEPTED","CONFLICT"]);
    owner(`DO $$ BEGIN
      IF (SELECT count(*) FROM erp.audit_log WHERE company_id='${tenant}' AND aggregate_id IN('RENT-UAT-C7-RELEASE-E','RENT-UAT-C7-RELEASE-F') AND action='RELEASE_RENTAL')<>2 THEN RAISE EXCEPTION 'race audit count'; END IF;
      IF (SELECT count(*) FROM erp.operational_command_idempotency WHERE company_id='${tenant}' AND target_aggregate_id IN('RENT-UAT-C7-RELEASE-E','RENT-UAT-C7-RELEASE-F') AND command_status='COMPLETED')<>2 THEN RAISE EXCEPTION 'race command count'; END IF;
    END $$;`);
  });

  it("uses frozen snapshots for two independent operators and rejects cross-line ownership",async()=>{
    const denied=await release(unauthorized,"RENT-UAT-C7-RELEASE-A","C733-DENIED");expect(denied.error).toBeNull();expect(denied.data).toMatchObject({success:false,code:"FORBIDDEN"});
    const start=(rpc:SupabaseClient,line:string,equipment:string,assignment:string,operator:string,deur:string,key=deur,withOverride=true)=>rpc.schema("erp").rpc("command_start_deur_shift",{command:{commandId:`CMD-${key}`,idempotencyKey:`IDEM-${key}`,rentalId:"RENT-UAT-C7-RELEASE-C",rentalLineId:line,equipmentId:equipment,assignmentId:assignment,operatorId:operator,deviceId:"C733",draft:withOverride?{id:deur,operationalMetadata:{source:"CLIENT-OVERRIDE",costCode:{code:"WRONG"}},workDate:"1999-01-01",evidenceMode:"COMPLETION"}:{id:deur}}});
    const lineA=await start(authorized,"LINE-UAT-C7-RELEASE-C1","EQP-UAT-C7-RELEASE-A","ASN-UAT-C7-RELEASE-A","OPR-UAT-C7-RELEASE-A","DEUR-UAT-C7-RELEASE-A");expect(lineA.error).toBeNull();expect(lineA.data).toMatchObject({success:true,disposition:"ACCEPTED"});
    const lineB=await start(operatorB,"LINE-UAT-C7-RELEASE-C2","EQP-UAT-C7-RELEASE-B","ASN-UAT-C7-RELEASE-B","OPR-UAT-C7-RELEASE-B","DEUR-UAT-C7-RELEASE-B",undefined,false);expect(lineB.error).toBeNull();expect(lineB.data).toMatchObject({success:true,disposition:"ACCEPTED"});
    expect((await start(authorized,"LINE-UAT-C7-RELEASE-C2","EQP-UAT-C7-RELEASE-B","ASN-UAT-C7-RELEASE-B","OPR-UAT-C7-RELEASE-B","DEUR-UAT-C7-RELEASE-WRONG-A","WRONG-A")).data).toMatchObject({success:false,code:"OWNERSHIP_MISMATCH"});
    expect((await start(operatorB,"LINE-UAT-C7-RELEASE-C1","EQP-UAT-C7-RELEASE-A","ASN-UAT-C7-RELEASE-A","OPR-UAT-C7-RELEASE-A","DEUR-UAT-C7-RELEASE-WRONG-B","WRONG-B")).data).toMatchObject({success:false,code:"OWNERSHIP_MISMATCH"});
    const replay=await start(authorized,"LINE-UAT-C7-RELEASE-C1","EQP-UAT-C7-RELEASE-A","ASN-UAT-C7-RELEASE-A","OPR-UAT-C7-RELEASE-A","DEUR-UAT-C7-RELEASE-A");expect(replay.data).toMatchObject({success:true,disposition:"REPLAYED"});
    owner(`DO $$ BEGIN
      IF (SELECT count(*) FROM erp.deurs WHERE company_id='${tenant}')<>2 THEN RAISE EXCEPTION 'unexpected DEUR count'; END IF;
      IF EXISTS(SELECT 1 FROM erp.deurs WHERE company_id='${tenant}' AND (work_date='1999-01-01' OR evidence_mode='COMPLETION' OR operational_metadata->>'source'='CLIENT-OVERRIDE' OR operational_metadata#>>'{costCode,code}'='WRONG')) THEN RAISE EXCEPTION 'client protected override persisted'; END IF;
      IF (SELECT count(*) FROM erp.deur_events WHERE company_id='${tenant}' AND action='start')<>4 THEN RAISE EXCEPTION 'canonical event count'; END IF;
    END $$;`);
  });
});
