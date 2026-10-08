import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredBrowserGroups,validateBrowserGroups} from './ci-browser-plan.mjs';

test('browser group plan admits only complete ordered acceptance matrix',()=>{
  const groups=['foundation','products','security'];
  assert.deepEqual(validateBrowserGroups(JSON.stringify(groups)),groups);
  assert.deepEqual(validateBrowserGroups(groups),groups);
  for(const bad of [[],['foundation'],['products'],['security'],
    ['foundation','products'],['foundation','security'],['products','security'],
    ['products','foundation','security'],['foundation','foundation','security'],
    ['foundation','products','security','other'],null,{},'garbage'])
    assert.throws(()=>validateBrowserGroups(bad),JSON.stringify(bad));
  assert.equal(requiredBrowserGroups.length,3);
});
