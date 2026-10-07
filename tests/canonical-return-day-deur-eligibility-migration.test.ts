import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const migration=readFileSync("supabase/migrations/20261004000900_pending_return_day_operator_deur_access.sql","utf8");

describe("same-day returned-line DEUR eligibility",()=>{
  it("keeps the normal active-assignment path and adds a separate return-day projection",()=>{
    expect(migration).toContain("target_line.status::text IN ('Released','Active')");
    expect(migration).toContain("target_assignment.status::text='Active'");
    expect(migration).toContain("read_pending_operator_return_day_deur_work");
    expect(migration).toContain("'PENDING_RETURN_DAY'");
  });
  it("allows only the linked active app user, their own completed returned line, and the operational return day",()=>{
    for(const marker of["auth.uid() IS NULL","actor.operator_id","line.operator_id=actor.operator_id","line.status::text<>'Returned'","assignment.status::text<>'Completed'","assignment.returned_date IS DISTINCT FROM line.actual_return_date","work_day<>operational_day"])expect(migration).toContain(marker);
  });
  it("requires a frozen per-workday identity and still excludes resolved, duplicate, and out-of-policy expectations",()=>{
    for(const marker of["snapshot#>>'{policy,frequency}'<>'PER_WORKDAY'","snapshot->>'rentalEquipmentLineId' IS DISTINCT FROM line.id","snapshot->>'operatorId' IS DISTINCT FROM actor.operator_id","deur_expectation_dispositions","DEUR_ALREADY_OPEN","excludeDates","effectiveFrom"])expect(migration).toContain(marker);
  });
  it("supports only pending or in-progress return-day DEUR and preserves command idempotency",()=>{
    for(const marker of["'state','IN_PROGRESS'","'state','PENDING'","'historicalReturnDay',true","effective_date:=line.actual_return_date","begin_deur_command","finish_deur_command","'REPLAYED'"])expect(migration).toContain(marker);
  });
  it("does not reopen equipment, assignments, rentals, or create operational side entities",()=>{
    for(const forbidden of["UPDATE erp.assignments","UPDATE erp.rental_equipment_lines","UPDATE erp.equipment","INSERT INTO erp.assignments","INSERT INTO erp.rental_equipment_lines","INSERT INTO erp.deur_expectation_dispositions"])expect(migration).not.toContain(forbidden);
  });
  it("limits executable entry points to authenticated users and retains tenant checks",()=>{
    expect(migration).toContain("erp.current_company_id()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION erp.read_pending_return_day_deur_eligibility");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.read_pending_operator_return_day_deur_work() TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_start_deur_shift(jsonb) TO authenticated");
  });
});
