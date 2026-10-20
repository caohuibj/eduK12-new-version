import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {admitPriorCourse,fixture,staticRelative,requireComplete,REQUIRED_CHECKS,ORIGIN} from './training-mac-browser.mjs';
test('exact six compiled UI checks required; empty skipped duplicate and missing evidence rejected',()=>{
 const result={status:'PASS',checks:REQUIRED_CHECKS.map(name=>({name,status:'PASS'})),errors:[]};
 requireComplete(result);
 for(const change of [{checks:[]},{checks:result.checks.slice(1)},{checks:result.checks.map((row,i)=>i?row:{...row,status:'SKIP'})},{checks:[result.checks[1],...result.checks.slice(1)]},{errors:[{code:'PAGE_ERROR'}]},{status:'FAIL'}])assert.throws(()=>requireComplete({...result,...change}));
});
test('synthetic APIs are exact GET allowlist, not permissive mock success',()=>{
 assert.equal(fixture('GET','/api/auth/me').data.role,'TEACHER');
 assert.equal(fixture('GET','/api/training/reference-governance/capabilities').data.length,1);
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

test('formal governance fixture matches visible review-only grant contract',()=>{
 const grants=fixture('GET','/api/training/reference-governance/capabilities').data;
 assert.equal(grants.length,1);
 assert.deepEqual(grants[0].capabilities,['reference.review']);
 assert.equal(grants[0].measurementReleaseIds.length,1);
 for(const id of [grants[0].grantId,...grants[0].measurementReleaseIds])assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const source=readFileSync(new URL('../../server-version/frontend/src/training/FormalReferenceStudio.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(!grants\.length&&!state\.pending&&!state\.result\)/);
 assert.match(source,/aria-label="正式参考独立审核与发布"/);
 assert.throws(()=>fixture('POST','/api/training/reference-governance/read'));
});
test('only exact prior desktop course PASS is admitted, retaining failed run provenance',()=>{
 const dist={sha256:'2b37eac6fdd8c8dd836b79c2f80e59abe4f90444f11a4baa9c2abbafc2202886',files:415};
 const prior={schema:1,kind:'verified-original-official-case',runId:'39512542094',attempt:1,sourceHead:'4e3e5d2d092ae42cc2f871ebbd9a9c81d18152b2',head:'9dd8f8f5d8951225b76a4df21862f571017e3221',tree:'4d53ec70df40781ddfe5a7359dca748820b25623',reportSha256:'4437c85e6d1b3830c0bf821340cd736d45fb3e09d3a5303f8c1c3e7a4a4b8920',originalStatus:'FAIL',dist,check:{name:'course-shell-1440',status:'PASS',geometry:{viewport:1440,document:1440},screenshot:'course-shell-1440.png'}};
 const row=admitPriorCourse(prior,dist);assert.equal(row.ciExecuted,false);assert.equal(row.screenshot,'original-course-shell-1440.png');assert.equal(row.original.originalStatus,'FAIL');assert.deepEqual(row.original.check,prior.check);
 for(const change of [{runId:'other'},{attempt:2},{originalStatus:'PASS'},{reportSha256:'0'.repeat(64)},{check:{...prior.check,name:'course-shell-390'}},{check:{...prior.check,status:'SKIP'}},{check:{...prior.check,geometry:{viewport:1440,document:1442}}}])assert.throws(()=>admitPriorCourse({...prior,...change},dist));
 assert.throws(()=>admitPriorCourse(prior,{...dist,files:416}));
});

test('remaining analysis and pending-editor fixtures satisfy consumed source fields and visibility guards',()=>{
 const courseId='11111111-1111-4111-8111-111111111111',productId='22222222-2222-4222-8222-222222222222';
 const sources=fixture('GET',`/api/courses/${courseId}/training-analysis/sources`).data;
 assert.equal(sources.total,sources.list.length);assert.equal(sources.list.length,1);
 const source=sources.list[0];assert.equal(source.taskId,productId);assert(Number.isFinite(Date.parse(source.publication)));assert.match(source.configDigest,/^[a-f0-9]{64}$/);assert.equal(source.variantKey,null);assert.equal(source.metrics.length,1);assert.equal(typeof source.metrics[0].metricKey,'string');
 const product=fixture('GET',`/api/questionnaire-products/${productId}`).data;
 assert.equal(product.status,'DRAFT');assert.equal(product.revision,8);assert.equal(product.questionnaireType,'COURSE');assert.deepEqual(product.questionnaireCourses,[]);assert.equal(product.publicEnabled,false);assert.deepEqual(product.formSections,[]);assert.equal(product.items[0].type,'COGNITIVE');assert.equal(product.items[0].id,source.metrics[0].itemId);assert.equal(typeof product.items[0].cognitiveAssignment.title,'string');
 const resources=fixture('GET','/api/questionnaire-products/resources').data;
 for(const field of ['scales','cognitive','situational','courses'])assert(Array.isArray(resources[field]));
 const editor=readFileSync(new URL('../../server-version/frontend/src/pages/questionnaire/QuestionnaireProducts.tsx',import.meta.url),'utf8');
 assert.match(editor,/const authoringLocked=!!pendingMeasurement\|\|selectionBlocked\|\|reportBlocked/);
 assert.match(editor,/<fieldset disabled=\{authoringLocked\} aria-label="组合测评编辑"/);
 assert(editor.includes('已重新读取当前草稿。请核对认知配置及发布记录；原请求仍保持未确认。'));
 assert(editor.includes("detail?.publicEnabled && detail.status === 'PUBLISHED'"));
});
