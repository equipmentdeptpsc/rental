import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260830002300_canonical_deur_turnover_custody.sql", "utf8");

describe("canonical DEUR turnover custody", () => {
  it("keeps the primary operator immutable and records custody separately", () => {
    expect(migration).toContain("CREATE TABLE erp.deur_turnovers");
    expect(migration).toContain("current_deur_authorized_operator");
    expect(migration).toContain("coalesce(latest_turnover.to_operator_id,deur_record.operator_id)");
    expect(migration).not.toMatch(/UPDATE erp\.deurs AS deur_record SET[^;]*operator_id/s);
    expect(migration).not.toMatch(/UPDATE erp\.rental_equipment_lines AS [\s\S]*operator_id/s);
    expect(migration).not.toMatch(/UPDATE erp\.assignments AS [\s\S]*operator_id/s);
  });

  it("requires an accepted custody transfer before a reliever can mutate", () => {
    expect(migration).toContain("command_initiate_deur_turnover");
    expect(migration).toContain("command_accept_deur_turnover");
    expect(migration).toContain("target_turnover.status<>'PENDING'");
    expect(migration).toContain("current_deur_authorized_operator(current_deur.id)<>command->>'operatorId'");
    expect(migration).toContain("TARGET_OPERATOR_CONFLICT");
    expect(migration).toContain("TARGET_OPERATOR_NOT_LOGIN_READY");
  });

  it("records turnover as lifecycle evidence without opening or replacing an activity", () => {
    expect(migration).toContain("'turnover','initiate'");
    expect(migration).toContain("'turnover','accept'");
    expect(migration).toContain("'turnover','initiate',now_at");
    expect(migration).toContain("'turnover','accept',now_at");
    expect(migration).toContain("'turnover'));");
    expect(migration).toContain("'start','end','initiate','accept'");
  });

  it("preserves idempotency, tenant derivation, and minimum executable grants", () => {
    expect(migration).toContain("erp.begin_deur_command(command,'INITIATE_DEUR_TURNOVER')");
    expect(migration).toContain("erp.begin_deur_command(command,'ACCEPT_DEUR_TURNOVER')");
    expect(migration).toContain("erp.finish_deur_command(command,'INITIATE_DEUR_TURNOVER'");
    expect(migration).toContain("erp.finish_deur_command(command,'ACCEPT_DEUR_TURNOVER'");
    expect(migration).toContain("tenant text:=erp.current_company_id()");
    expect(migration).toContain("REVOKE ALL ON erp.deur_turnovers FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_initiate_deur_turnover(jsonb),erp.command_accept_deur_turnover(jsonb) TO authenticated");
  });
});
