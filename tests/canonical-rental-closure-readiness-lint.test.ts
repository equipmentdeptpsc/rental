import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('canonical Rental closure readiness lint repair', () => {
  const sql = readFileSync(resolve('supabase/migrations/20260828000500_canonical_rental_closure_readiness_lint.sql'), 'utf8');

  it('uses a forward-only replacement without changing blocker semantics', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION erp.get_rental_closure_readiness(command jsonb)');
    expect(sql).toContain("target_rental_id text=command->>'rentalId'");
    expect(sql).not.toMatch(/DECLARE[^;]*\brental_id\s+text/);
    for (const blocker of ['LINE_NOT_RETURNED', 'DEUR_INCOMPLETE', 'ASSIGNMENT_ACTIVE']) expect(sql).toContain(blocker);
  });

  it('qualifies every rental_id comparison against the renamed variable', () => {
    expect(sql.match(/\.rental_id=target_rental_id/g)).toHaveLength(3);
    expect(sql).not.toMatch(/\.rental_id=rental_id/);
  });
});
