import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapDeur } from "@/integrations/supabase/readRepositories";

describe("remote Operator DEUR work-date and event projection", () => {
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
});
