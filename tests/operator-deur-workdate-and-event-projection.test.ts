import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapDeur } from "@/integrations/supabase/readRepositories";
import { createDeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import { readFileSync as readSource } from "node:fs";

describe("remote Operator DEUR work-date and event projection", () => {
  it("uses the DEUR commercial-snapshot foreign key explicitly in the remote embed",()=>{
    expect(readSource("src/integrations/supabase/readRepositories.ts","utf8")).toContain("commercial_snapshots!deurs_commercial_snapshot_id_fkey(*)");
  });
  it("hydrates the exact immutable commercial snapshot and omits database null optionals", () => {
    const result=mapDeur({id:"deur-1",rental_id:"rental-1",commercial_snapshot_id:"snapshot-1",commercial_snapshot_required:true,equipment_id:"eq",operator_id:"op",work_date:"2026-08-26",status:"Acknowledged",created_at:"2026-08-26T01:00:00Z",updated_at:"2026-08-26T01:00:00Z",deur_events:[],commercial_snapshots:{id:"snapshot-1",rental_id:"rental-1",rental_equipment_line_id:"line-1",billing_method:"Per Hour",currency:"PHP",unit_rate:1000,minimum_billable_hours:null,overtime_rate:null,standby_rate:null,mobilization_fee:null,demobilization_fee:null,fuel_charge:null,operator_included:true,operator_rate:null,tax_rate:null,withholding_tax:null,contract_amount:null,captured_at:"2026-08-25T01:00:00Z"}});
    expect(result).toMatchObject({success:true,value:{commercialSnapshot:{billingMethod:"Per Hour",currency:"PHP",unitRate:1000,operatorIncluded:true,capturedAt:"2026-08-25T01:00:00.000Z"}}});
    if(result.success)expect(result.value.commercialSnapshot).not.toHaveProperty("minimumBillableHours");
  });
  it("calculates the current UAT fixture read-only from operation intervals and the immutable rate", () => {
    const events=[
      {id:"1",activity_type:"shift",action:"start",occurred_at:"2026-08-26T01:17:39Z",sequence:1,source:"user"},
      {id:"2",activity_type:"operation",action:"start",occurred_at:"2026-08-26T01:17:39Z",sequence:2,source:"user"},
      {id:"3",activity_type:"operation",action:"end",occurred_at:"2026-08-26T05:06:12Z",sequence:3,source:"user"},
      {id:"4",activity_type:"idle",action:"start",occurred_at:"2026-08-26T05:06:12Z",sequence:4,source:"user"},
      {id:"5",activity_type:"idle",action:"end",occurred_at:"2026-08-26T05:06:23Z",sequence:5,source:"user"},
      {id:"6",activity_type:"breakdown",action:"start",occurred_at:"2026-08-26T05:06:23Z",sequence:6,source:"user"},
      {id:"7",activity_type:"breakdown",action:"end",occurred_at:"2026-08-26T05:06:37Z",sequence:7,source:"user"},
      {id:"8",activity_type:"operation",action:"start",occurred_at:"2026-08-26T05:06:37Z",sequence:8,source:"user"},
      {id:"9",activity_type:"operation",action:"end",occurred_at:"2026-08-26T05:10:38Z",sequence:9,source:"user"},
      {id:"10",activity_type:"shift",action:"end",occurred_at:"2026-08-26T05:10:38Z",sequence:10,source:"user"},
    ];
    const mapped=mapDeur({id:"4223f012-9473-4fd5-9575-96cd984ec1a2",deur_number:"DEUR-2026-000001",rental_id:"0ac5c327-2d47-46e9-b94f-2b77deb27427",rental_equipment_line_id:"52ea3624-e8f1-44aa-a89d-02caadf2fe51",equipment_id:"equipment",operator_id:"operator",work_date:"2026-08-26",status:"Acknowledged",legacy:false,commercial_snapshot_required:true,total_operating_minutes:0,total_idle_minutes:0,total_maintenance_minutes:0,total_meal_break_minutes:0,total_mobilization_minutes:0,total_demobilization_minutes:0,created_at:"2026-08-26T01:17:39Z",updated_at:"2026-08-26T12:07:39Z",deur_events:events,commercial_snapshots:{id:"snapshot",rental_id:"0ac5c327-2d47-46e9-b94f-2b77deb27427",rental_equipment_line_id:"52ea3624-e8f1-44aa-a89d-02caadf2fe51",billing_method:"Per Hour",currency:"PHP",unit_rate:1000,operator_included:true,captured_at:"2026-08-25T01:00:00Z"}});
    if(!mapped.success)throw new Error("UAT fixture mapping failed");
    const preview=createDeurBillingPreview({deur:mapped.value,terms:{billingMethod:"Per Hour",unitRate:9999,operatorIncluded:false},evaluatedAt:"2026-08-27T00:00:00Z"});
    expect(preview).toMatchObject({status:"available",commercialTermsSource:"IMMUTABLE_SNAPSHOT",evidence:{operatingMinutes:233,idleMinutes:0},rates:{unitRate:1000,operatorIncluded:true},charges:{operatingHours:233/60,operatingCharge:233000/60,subtotal:233000/60,vat:0,withholdingTax:0,grandTotal:233000/60}});
  });
  it("derives PER_WORKDAY from server time while retaining the immutable policy timezone", () => {
    const sql=readFileSync("supabase/migrations/20260825000800_operator_deur_workdate_correction.sql","utf8");
    expect(sql).toContain("snap#>>'{policy,frequency}'='PER_WORKDAY'");
    expect(sql).toContain("timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date");
    expect(sql).toContain("begin_deur_command(command,'START_SHIFT')");
    expect(sql).toContain("'shift','start'"); expect(sql).toContain("'operation','start'");
    expect(sql).not.toMatch(/UPDATE\s+erp\.deurs|UPDATE\s+deurs/i);
  });
  it("hydrates ordered server events without exposing a second start action", () => {
    const result=mapDeur({id:"deur-1",rental_id:"rental-1",equipment_id:"eq",operator_id:"op",work_date:"2026-08-26",status:"In Progress",logs:[],created_at:"2026-08-26T01:00:00Z",updated_at:"2026-08-26T01:00:00Z",deur_events:[
      {id:"e2",deur_id:"deur-1",activity_type:"operation",action:"start",occurred_at:"2026-08-26T01:00:00Z",sequence:2,source:"server",actor_id:"user"},
      {id:"e1",deur_id:"deur-1",activity_type:"shift",action:"start",occurred_at:"2026-08-26T01:00:00Z",sequence:1,source:"server",actor_id:"user"},
    ]});
    expect(result).toMatchObject({success:true,value:{events:[{activityType:"shift",action:"start",sequence:1},{activityType:"operation",action:"start",sequence:2}]}});
  });
  it("normalizes absent compatibility logs without changing canonical events", () => {
    const result=mapDeur({id:"deur-1",rental_id:"rental-1",equipment_id:"eq",operator_id:"op",work_date:"2026-08-26",status:"Acknowledged",created_at:"2026-08-26T01:00:00Z",updated_at:"2026-08-26T01:00:00Z",deur_events:[
      {id:"event-1",deur_id:"deur-1",activity_type:"operation",action:"start",occurred_at:"2026-08-26T01:00:00Z",sequence:1,source:"user"},
    ]});
    expect(result).toMatchObject({success:true,value:{logs:[],events:[{id:"event-1"}]}});
  });
  it("preserves existing compatibility logs", () => {
    const logs=[{id:"log-1",type:"Operation",timestamp:"2026-08-26T01:00:00Z"}];
    const result=mapDeur({id:"deur-1",rental_id:"rental-1",equipment_id:"eq",operator_id:"op",work_date:"2026-08-26",status:"Acknowledged",logs,created_at:"2026-08-26T01:00:00Z",updated_at:"2026-08-26T01:00:00Z",deur_events:[]});
    expect(result).toMatchObject({success:true,value:{logs}});
  });
});
