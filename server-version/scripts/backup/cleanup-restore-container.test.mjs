import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupRestoreContainer } from './cleanup-restore-container.mjs';

test('cleanup removes only the generated temporary container and anonymous volumes', () => {
  let invocation;
  assert.equal(cleanupRestoreContainer('eduk12-restore-abcdef123456', (...args) => {
    invocation = args;
    return { status: 0 };
  }), true);
  assert.deepEqual(invocation[1], ['rm', '--force', '--volumes', 'eduk12-restore-abcdef123456']);
  assert.equal(invocation[2].timeout, 30000);
});
test('cleanup refuses production containers before invoking docker', () => {
  let calls = 0;
  assert.throws(() => cleanupRestoreContainer('eduk12-prod-postgres', () => calls++));
  assert.equal(calls, 0);
});
test('timeout or Docker failure is reported instead of marked successful', () => {
  assert.equal(cleanupRestoreContainer('eduk12-restore-abcdef123456', () => ({ status: 1 })), false);
  assert.equal(cleanupRestoreContainer('eduk12-restore-abcdef123456', () => ({ status: null, error: new Error('timeout') })), false);
});
