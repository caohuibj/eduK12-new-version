import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { boundedCache, bytes, assertDedicatedHome, assertWorkspace } from './mac-ci-cleanup.mjs';
test('cleanup refuses personal accounts and checkouts outside the dedicated runner',()=>{
  assertDedicatedHome('/Users/eduk12ci','eduk12ci');
  assert.throws(()=>assertDedicatedHome('/Users/Qiang','Qiang'));
  assert.throws(()=>assertDedicatedHome('/Users/eduk12ci','root'));
  assertWorkspace('/Users/eduk12ci','/Users/eduk12ci/actions-runner/_work/repo/repo');
  for(const path of ['/Users/Qiang/work/repo','/Users/eduk12ci/actions-runner/_work/_tool/node','/Users/eduk12ci/actions-runner/_work/repo/../repo'])
    assert.throws(()=>assertWorkspace('/Users/eduk12ci',path));
});
test('bounded and expired caches are removed without following links into other data',()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'mac-ci-cache-')));
  try {
    const cache=join(root,'cache'), outside=join(root,'outside');
    mkdirSync(cache);mkdirSync(outside);writeFileSync(join(outside,'secret'),'keep');
    symlinkSync(outside,join(cache,'link'),'dir');writeFileSync(join(cache,'blob'),'123456');
    assert.equal(bytes(cache),6);
    assert.equal(boundedCache(cache,{maxBytes:10,maxAgeMs:100,now:1000}).removedBytes,0);
    assert.equal(boundedCache(cache,{maxBytes:10,maxAgeMs:100,now:1100}).removedBytes,6);
    assert.ok(existsSync(join(outside,'secret')));
    mkdirSync(cache);writeFileSync(join(cache,'blob'),'123456');
    assert.equal(boundedCache(cache,{maxBytes:5,maxAgeMs:100,now:1101}).removedBytes,6);
    symlinkSync(outside,join(root,'parent'),'dir');
    mkdirSync(join(outside,'child'));
    assert.throws(()=>boundedCache(join(root,'parent','child'),{maxBytes:1,maxAgeMs:1}));
    symlinkSync(outside,cache,'dir');
    assert.throws(()=>boundedCache(cache,{maxBytes:1,maxAgeMs:1}));
    assert.ok(existsSync(join(outside,'secret')));
  } finally {rmSync(root,{recursive:true,force:true});}
});
