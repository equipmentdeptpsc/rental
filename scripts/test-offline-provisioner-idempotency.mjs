import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync('worker/uatDeurOfflineDomainProvisioner.ts', 'utf8');
for (const stage of ['RENTAL', 'PREPARE', 'RELEASE', 'ACTIVATE']) {
  assert.match(worker, new RegExp(`id\\('${stage}','rental'\\)`));
  assert.match(worker, new RegExp(`canonical\\(client,'${stage}'`));
}
assert.match(worker, /idempotencyKey:`uat-offline:\$\{stage\.toLowerCase\(\)\}:\$\{s\[entity\+'Id'\]\}`/);
assert.doesNotMatch(worker, /id\('rental'\)/);
assert.match(worker, /failedStage,failedCode/);
console.log('PASS offline provisioner stage-scoped idempotency');
