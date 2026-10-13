import type { RentalEquipmentLine } from '@/features/rental/equipment-line/types';

export function rentalLineMeterPolicy(line: RentalEquipmentLine, rentalStatus: string): string {
  if (rentalStatus === 'Draft') return 'Pending reservation — the canonical service derives the frozen policy from Equipment Maintenance Type';
  const policy = line.deurExpectationSnapshot?.meterRequirement;
  if (policy === 'odometer' || policy === 'both') return `${policy === 'both' ? 'Hour meter + odometer' : 'Odometer'} — travel checkpoints and refuel available during an open shift`;
  if (policy === 'hourMeter') return 'Hour meter — odometer checkpoints and refuel unavailable';
  if (policy === 'none') return 'No meter required — odometer checkpoints and refuel unavailable';
  return 'Not configured — meter-dependent actions unavailable until the canonical release snapshot is available';
}
