import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261013000200_block_post_shift_deur_mutations.sql', 'utf8');

describe('post-shift canonical DEUR mutation boundary', () => {
  it('guards activity, repeated End Shift, travel checkpoints, and refuel', () => {
    for (const name of ['command_transition_deur_activity', 'command_complete_deur_shift', 'command_record_deur_travel_checkpoint', 'command_record_deur_refuel']) {
      expect(sql).toContain(name);
    }
    expect(sql.match(/activity_type=''shift'' AND action=''end''/g)).toHaveLength(3);
    expect(sql).toContain("'INVALID_TRANSITION'");
    expect(sql).toContain('pg_get_functiondef');
  });
  it('does not replace the Submit command or billing calculations', () => {
    expect(sql).not.toContain('command_submit_deur');
    expect(sql).not.toContain('billing');
  });
});
