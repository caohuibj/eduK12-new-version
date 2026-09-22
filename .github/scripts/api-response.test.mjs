import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { assertApiSuccess } = createRequire(import.meta.url)('../../server-version/e2e/helpers/api-response.cjs');
test('preserves transaction and authorization errors instead of dereferencing null', () => {
  for (const status of [500, 403]) {
    assert.throws(() => assertApiSuccess(status, { code: status, data: null, message: 'underlying failure' }, 'GET attempt'),
      error => error.name === 'AssertionError' && error.message.includes(`HTTP ${status}`) && error.message.includes('underlying failure'));
  }
  assert.throws(() => assertApiSuccess(200, {code:1,data:null}, 'GET attempt'), /GET attempt/);
  assert.throws(() => assertApiSuccess(200, {code:0,data:null}, 'GET attempt'), /GET attempt/);
  assert.deepEqual(assertApiSuccess(200, {code:0,data:{status:'COMPLETED'}}, 'GET attempt'), {status:'COMPLETED'});
});
