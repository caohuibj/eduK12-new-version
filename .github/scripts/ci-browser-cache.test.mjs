import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,mkdirSync,symlinkSync,rmSync}from 'node:fs';import{join}from 'node:path';import{tmpdir}from 'node:os';import{browserCachePath,pinnedBrowserVersion}from './ci-browser-cache.mjs';
test('each lane, platform, architecture and Playwright version has a private cache',()=>{
 const temp=mkdtempSync(join(tmpdir(),'browser-cache-'));try{
  const a=join(temp,'mac-heavy'),b=join(temp,'mac-light');mkdirSync(a);mkdirSync(b);
  const paths=[browserCachePath(a,'1.62.1','darwin','arm64'),browserCachePath(b,'1.62.1','darwin','arm64'),browserCachePath(a,'1.62.2','darwin','arm64'),browserCachePath(a,'1.62.1','linux','x64')];assert.equal(new Set(paths).size,4);
  assert.throws(()=>browserCachePath(a,'latest','darwin','arm64'));assert.throws(()=>browserCachePath(temp,'1.62.1','darwin','arm64'));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('symlinked cache and lock/runtime mismatch fail closed',()=>{
 const temp=mkdtempSync(join(tmpdir(),'browser-cache-'));try{const root=join(temp,'win-heavy'),other=join(temp,'other');mkdirSync(root);mkdirSync(other);symlinkSync(other,join(root,'cache'), 'dir');assert.throws(()=>browserCachePath(root,'1.62.1','linux','x64'),/symlink/);}finally{rmSync(temp,{recursive:true,force:true});}
 const lock={packages:{'':{dependencies:{'playwright-core':'1.62.1'}},'node_modules/playwright-core':{version:'1.62.1'}}};assert.equal(pinnedBrowserVersion(lock,{version:'1.62.1'}),'1.62.1');assert.throws(()=>pinnedBrowserVersion(lock,{version:'1.62.2'}),/lockfile/);lock.packages[''].dependencies['playwright-core']='^1.62.1';assert.throws(()=>pinnedBrowserVersion(lock,{version:'1.62.1'}),/lockfile/);
});
