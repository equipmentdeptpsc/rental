import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assignmentCreateFieldErrors } from '@/features/assignment/services/assignmentCreateFieldErrors';

describe('canonical Assignment create feedback', () => {
  it.each([
    ['ASSIGNMENT_START_DATE_IN_PAST', 'assignedDate'],
    ['CUSTOMER_PROJECT_MISMATCH', 'projectId'],
    ['EQUIPMENT_INTERVAL_CONFLICT', 'equipmentId'],
    ['EQUIPMENT_UNAVAILABLE', 'equipmentId'],
    ['OPERATOR_ALREADY_ASSIGNED', 'operatorId'],
  ])('maps %s to %s', (code, field) => {
    expect(assignmentCreateFieldErrors(code)).toHaveProperty(field);
  });
  it('does not invent a field for an undiagnosed generic rejection', () => {
    expect(assignmentCreateFieldErrors('VALIDATION_REJECTED')).toEqual({});
  });
  it('preserves form values after rejection and leaves Activity Code optional', () => {
    const form = readFileSync('src/features/assignment/components/RemoteAssignmentForm.tsx', 'utf8');
    expect(form).toContain('setFieldErrors(assignmentCreateFieldErrors(result.code))');
    expect(form).toContain('activityCodeId: form.activityCodeId || undefined');
    expect(form).not.toContain('setForm({ equipmentId:');
  });
});
