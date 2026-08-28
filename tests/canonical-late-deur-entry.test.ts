import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260828000400_canonical_late_deur_entry.sql","utf8");
const normalStart=readFileSync("supabase/migrations/20260825000800_operator_deur_workdate_correction.sql","utf8");

describe("canonical late DEUR entry migration",()=>{
  it("introduces late-entry provenance while keeping normal Start Shift server-dated and shift-optional",()=>{
    expect(migration).toContain("entry_mode text NOT NULL DEFAULT 'NORMAL'");
    expect(migration).toContain("entry_mode='LATE_ENTRY'");
    expect(migration).toContain("late_recorded_at timestamptz");
    expect(migration).toContain("late_recorded_by uuid");
    expect(normalStart).toContain("effective_work_date=CASE WHEN snap#>>'{policy,frequency}'='PER_WORKDAY' THEN timezone");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION erp.command_start_deur_shift");
    expect(migration).toContain("effective_work_date=timezone(coalesce(nullif(snap#>>'{policy,timezone}',''),'UTC'),now_at)::date");
    expect(migration).not.toContain("IF snap#>>'{policy,frequency}'='PER_SHIFT' AND");
    expect(migration).toContain("uq_deur_line_workday_origin");
    expect(migration).toContain("company_id,rental_equipment_line_id,work_date");
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX[^;]+shift/is);
  });

  it("grants the narrow permission only to System Administrator",()=>{
    expect(migration).toContain("'deur.lateEntry.create'");
    expect(migration).toContain("role.code='system-administrator'");
    expect(migration).toContain("role.code<>'system-administrator'");
    expect(migration).not.toMatch(/operations-manager[^;]*deur\.lateEntry\.create/i);
  });

  it("derives tenant, actor, and recording time server-side and rejects spoofing",()=>{
    expect(migration).toContain("tenant text=erp.current_company_id(); actor uuid=auth.uid(); now_at timestamptz=clock_timestamp()");
    for(const forbidden of ["companyId","actorId","recordedAt","recordedBy","createdAt","createdBy"]) expect(migration).toContain(`'${forbidden}'`);
    expect(migration).toContain("DEUR_LATE_ENTRY_CREATED");
  });

  it("validates the historical expectation and complete factual interval evidence",()=>{
    expect(migration).toContain("work_day>=local_today");
    expect(migration).toContain("work_day<greatest");
    expect(migration).toContain("work_day>return_day");
    expect(migration).toContain("interval_start<shift_start OR interval_end>shift_end");
    expect(migration).toContain("interval_start<previous_end");
    expect(migration).toContain("IF operation_minutes=0");
    expect(migration).not.toMatch(/selected_shift IS NULL/);
    expect(migration).not.toContain("selected_shift NOT IN('Day','Night')");
    expect(migration).toContain("selected_shift=btrim(selected_shift)");
    expect(migration).toContain("length(selected_shift)>80");
    expect(migration).toContain("selected_shift~'[[:cntrl:]]'");
    expect(migration).toContain("shift_end>shift_start+interval '36 hours'");
  });

  it("binds canonical relationships and rejects waived, satisfied, duplicate, and cross-tenant targets",()=>{
    expect(migration).toContain("rental_id=target.id AND company_id=tenant");
    expect(migration).toContain("command->>'equipmentId'<>line.equipment_id");
    expect(migration).toContain("command->>'assignmentId'<>line.assignment_id");
    expect(migration).toContain("command->>'operatorId'<>line.operator_id");
    expect(migration).toContain("'EXPECTATION_WAIVED'");
    expect(migration).toContain("'EXPECTATION_HAS_DEUR'");
    expect(migration).toContain("'REPLAYED'");
  });

  it("submits for genuine customer review while preserving billing prerequisites",()=>{
    expect(migration).toContain("'Submitted'");
    expect(migration).not.toMatch(/billing_locked\s*=\s*true|billing_statement_id\s*=|INSERT INTO erp\.billing/i);
    expect(migration).toContain("'recordedLaterAt'");
    expect(migration).toContain("'lateEntryReason'");
    expect(migration).toContain("customer_review_requests");
    expect(migration).toContain("customer_review_batch_items");
  });
});
