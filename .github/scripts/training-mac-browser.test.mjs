import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,staticRelative,requireComplete,REQUIRED_CHECKS,ORIGIN} from './training-mac-browser.mjs';
test('exact six compiled UI checks required; empty skipped duplicate and missing evidence rejected',()=>{
 const result={status:'PASS',checks:REQUIRED_CHECKS.map(name=>({name,status:'PASS'})),errors:[]};
 requireComplete(result);
 for(const change of [{checks:[]},{checks:result.checks.slice(1)},{checks:result.checks.map((row,i)=>i?row:{...row,status:'SKIP'})},{checks:[result.checks[1],...result.checks.slice(1)]},{errors:[{code:'PAGE_ERROR'}]},{status:'FAIL'}])assert.throws(()=>requireComplete({...result,...change}));
});
test('synthetic APIs are exact GET allowlist, not permissive mock success',()=>{
 assert.equal(fixture('GET','/api/auth/me').data.role,'TEACHER');
 assert.deepEqual(fixture('GET','/api/training/reference-governance/capabilities').data,[]);
 for(const [method,url] of [['POST','/api/auth/me'],['GET','/api/unknown'],['GET','/api/auth/me/other']])assert.throws(()=>fixture(method,url));
});
test('only exact origin compiled assets and SPA routes resolve locally',()=>{
 assert.equal(staticRelative(ORIGIN+'/courses/synthetic/detail'),'index.html');
 assert.equal(staticRelative(ORIGIN+'/assets/app.js'),'assets/app.js');
 for(const url of ['https://other.invalid/assets/a.js',ORIGIN+'/assets/%2e%2e%2ffile.js',ORIGIN+'/assets/%5csecret',ORIGIN+'/assets/%00x',ORIGIN+'/unexpected.json'])assert.throws(()=>staticRelative(url));
});

test('synthetic success envelope satisfies the current real API client message requirement',()=>{
 const source=readFileSync(new URL('../../server-version/frontend/src/api/client.ts',import.meta.url),'utf8');
 const parser=source.slice(source.indexOf('const parseApiResponse'),source.indexOf('// 类型安全的 API 客户端'));
 assert.match(parser,/typeof \(value as \{ message\?: unknown \}\)\.message !== 'string'/);
 for(const pathname of ['/api/auth/me','/api/capabilities','/api/questionnaire-products/resources']){
  const envelope=fixture('GET',pathname);
  assert.equal(envelope.code,0);
  assert.equal(typeof envelope.message,'string');
  assert.notEqual(envelope.data,undefined);
 }
});
