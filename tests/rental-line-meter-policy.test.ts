import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rentalLineMeterPolicy } from '@/features/rental/workspace/overview/sections/rentalLineMeterPolicy';
import type { RentalEquipmentLine } from '@/features/rental/equipment-line/types';

const line = (meterRequirement?: 'none' | 'hourMeter' | 'odometer' | 'both') => ({
  deurExpectationSnapshot: meterRequirement ? { meterRequirement } : undefined,
}) as RentalEquipmentLine;

describe('canonical Rental line meter policy visibility', () => {
  it.each(['odometer', 'both'] as const)('shows enabled travel and refuel for %s', policy => {
    expect(rentalLineMeterPolicy(line(policy), 'Active')).toContain('travel checkpoints and refuel available');
  });
  it.each(['none', 'hourMeter'] as const)('explains restrictions for %s', policy => {
    expect(rentalLineMeterPolicy(line(policy), 'Active')).toContain('unavailable');
  });
  it('does not fabricate a missing release policy', () => {
    expect(rentalLineMeterPolicy(line(), 'Active')).toContain('Not configured');
  });
  it('does not present a draft preparation selection as the frozen policy', () => {
    expect(rentalLineMeterPolicy(line('none'), 'Draft')).toContain('Pending reservation');
  });
  it('uses the same frozen snapshot field consumed by mobile after reservation', () => {
    const freeze = readFileSync('supabase/migrations/20260926000100_freeze_canonical_equipment_meter_policy.sql', 'utf8');
    const projection = readFileSync('src/integrations/supabase/readRepositories.ts', 'utf8');
    expect(freeze).toContain('effective_equipment_meter_capability(e.meter_capability,e.maintenance_type)');
    expect(projection).toContain('deurExpectationSnapshot');
  });
});
