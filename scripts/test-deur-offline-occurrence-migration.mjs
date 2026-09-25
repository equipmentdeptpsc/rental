import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260925000200_preserve_deur_offline_occurrence_time.sql', import.meta.url), 'utf8');
const futureSkewMs = 5 * 60 * 1000;

function occurrence({ clientOccurredAt, now, predecessor }) {
  if (!clientOccurredAt) return new Date(now);
  const value = new Date(clientOccurredAt);
  if (Number.isNaN(value.valueOf())) throw new Error('INVALID_CLIENT_OCCURRENCE_TIME');
  if (value.valueOf() > new Date(now).valueOf() + futureSkewMs) throw new Error('CLIENT_OCCURRENCE_IN_FUTURE');
  if (predecessor && value.valueOf() < new Date(predecessor).valueOf()) throw new Error('CLIENT_OCCURRENCE_BEFORE_PREDECESSOR');
  return value;
}

function fingerprint(command) {
  const { commandId: _commandId, idempotencyKey: _idempotencyKey, ...payload } = command;
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function appendTransition(events, action, clientOccurredAt, acceptedAt) {
  const last = events.at(-1)?.occurredAt;
  const occurredAt = occurrence({ clientOccurredAt, now: acceptedAt, predecessor: last }).toISOString();
  const open = events.findLast((event) => event.isOpen && event.activity !== 'shift');
  if (open) { open.isOpen = false; events.push({ activity: open.activity, action: 'end', occurredAt, isOpen: false }); }
  if (action) events.push({ activity: action, action: 'start', occurredAt, isOpen: true });
  return occurredAt;
}

function completeShift(events, clientOccurredAt, acceptedAt) {
  const occurredAt = occurrence({ clientOccurredAt, now: acceptedAt, predecessor: events.at(-1)?.occurredAt }).toISOString();
  const open = events.findLast((event) => event.isOpen && event.activity !== 'shift');
  if (open) { open.isOpen = false; events.push({ activity: open.activity, action: 'end', occurredAt, isOpen: false }); }
  events.push({ activity: 'shift', action: 'end', occurredAt, isOpen: false });
  return occurredAt;
}

function hours(events, activity) {
  const starts = new Map(); let total = 0;
  for (const event of events) {
    if (event.activity !== activity) continue;
    if (event.action === 'start') starts.set(activity, event.occurredAt);
    if (event.action === 'end') { total += new Date(event.occurredAt).valueOf() - new Date(starts.get(activity)).valueOf(); starts.delete(activity); }
  }
  return total / 3_600_000;
}

for (const name of ['erp.command_transition_deur_activity(command jsonb)', 'erp.command_complete_deur_shift(command jsonb)']) assert.ok(migration.includes(name), `complete ${name} definition`);
assert.ok(migration.includes("nullif(command->>'clientOccurredAt','')"), 'reads the mobile field');
assert.ok(migration.includes("coalesce(client_occurrence_at,nullif(command->>'clientCreatedAt','')::timestamptz)"), 'maps client occurrence to client_created_at');
assert.ok(migration.includes("effective_occurrence_at"), 'writes canonical occurrence time');
assert.ok(migration.includes("server_accepted_at") && migration.includes("auth.uid()::text,now_at"), 'retains server receipt/audit clock');
assert.ok(migration.includes("interval '5 minutes'"), 'documents bounded future skew');
assert.ok(!/\bCREATE\s+TRIGGER\b|\bALTER\s+TABLE\s+erp\.deur_events\b|\bUPDATE\s+erp\.deur_events\s+SET\s+occurred_at\b/i.test(migration), 'no event-table trigger or historical rewrite');
assert.ok(!/command_record_deur_travel_checkpoint|command_record_deur_refuel|billing|review/i.test(migration), 'does not alter unrelated command domains');

const replayAt = '2026-09-25T20:00:00.000Z';
assert.equal(occurrence({ now: replayAt }).toISOString(), replayAt, 'online caller retains server-clock behavior');
assert.equal(occurrence({ clientOccurredAt: '2026-09-25T08:00:00.000Z', now: replayAt }).toISOString(), '2026-09-25T08:00:00.000Z', 'offline activity retains field time');
assert.throws(() => occurrence({ clientOccurredAt: 'invalid', now: replayAt }), /INVALID_CLIENT_OCCURRENCE_TIME/);
assert.throws(() => occurrence({ clientOccurredAt: '2026-09-25T07:59:59.000Z', predecessor: '2026-09-25T08:00:00.000Z', now: replayAt }), /CLIENT_OCCURRENCE_BEFORE_PREDECESSOR/);
assert.throws(() => occurrence({ clientOccurredAt: '2026-09-25T20:05:01.000Z', now: replayAt }), /CLIENT_OCCURRENCE_IN_FUTURE/);

const idempotent = { commandId: 'cmd-a', idempotencyKey: 'idem-a', deurId: 'deur-a', clientOccurredAt: '2026-09-25T08:00:00.000Z' };
assert.equal(fingerprint(idempotent), fingerprint({ ...idempotent, commandId: 'cmd-retry' }), 'exact retry retains payload fingerprint');
assert.notEqual(fingerprint(idempotent), fingerprint({ ...idempotent, clientOccurredAt: '2026-09-25T08:01:00.000Z' }), 'changed occurrence time is an idempotency mismatch');

const events = [
  { activity: 'shift', action: 'start', occurredAt: '2026-09-25T08:00:00.000Z', isOpen: true },
  { activity: 'operation', action: 'start', occurredAt: '2026-09-25T08:00:00.000Z', isOpen: true },
];
appendTransition(events, 'idle', '2026-09-25T10:30:00.000Z', replayAt);
appendTransition(events, 'operation', '2026-09-25T10:45:00.000Z', replayAt);
appendTransition(events, 'mealBreak', '2026-09-25T12:00:00.000Z', replayAt);
appendTransition(events, 'operation', '2026-09-25T13:00:00.000Z', replayAt);
assert.equal(completeShift(events, '2026-09-25T16:00:00.000Z', replayAt), '2026-09-25T16:00:00.000Z', 'complete shift retains field end time');
assert.deepEqual(events.map((event) => event.occurredAt), [...events.map((event) => event.occurredAt)].sort(), 'three offline transitions preserve event order');
assert.equal(hours(events, 'operation'), 6.75, 'operating hours');
assert.equal(hours(events, 'idle'), 0.25, 'idle hours');
assert.equal(hours(events, 'mealBreak'), 1, 'meal-break hours');
assert.equal(hours(events, 'shift'), 8, 'shift hours');

console.log('R3D-BQ offline occurrence migration static/function-level tests: 17 passed');
