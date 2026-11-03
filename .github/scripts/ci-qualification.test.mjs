import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {classifyQualification,unitOnly,closureDigest,verifyHistoricalSuccess} from './ci-qualification.mjs';
const item=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const sha=c=>c.repeat(40);
const digest=c=>c.repeat(64);

test('pure presentation and tests never turn into platform full gate',()=>{
 assert.deepEqual(classifyQualification([item('server-version/frontend/src/pages/scale-editor.css')]),{level:'L1',route:'presentation',reason:'local-style-only'});
 assert.equal(classifyQualification([item('server-version/frontend/src/pages/editor.test.tsx')]).route,'frontend-test');
 assert(unitOnly([item('server-version/backend/src/__tests__/situational/scientific-governance.test.ts')]));
 assert.equal(classifyQualification([item('docs/contributing/ci.md')]).level,'L0');
});
test('unknown, mixed, shared runtime, global CSS and CI edits escalate',()=>{
 for(const files of [
  ['server-version/frontend/src/index.css'],
  ['.github/workflows/ci.yml'],
  ['server-version/backend/src/modules/situational/situational-runtime.service.ts'],
  ['server-version/backend/src/__tests__/situational/scientific-governance.test.ts','server-version/backend/src/modules/situational/runtime.ts'],
  ['server-version/backend/src/__tests__/situational/u4.postgres.integration.test.ts']
 ])assert.equal(classifyQualification(files.map(item)).level,'L4',files.join(','));
 assert.equal(classifyQualification([{...item('README.md'),status:'D',newMode:'000000'}]).level,'L4');
 assert.throws(()=>classifyQualification([item('README.md'),item('README.md')]));
 assert.throws(()=>classifyQualification([]));
});
test('closure fingerprints include exact modes and bytes but omit unrelated frontend-only files for backend lane',()=>{
 const source=[
  {path:'.github/workflows/ci.yml',mode:'100644',type:'blob',sha:sha('a')},
  {path:'server-version/backend/src/service.ts',mode:'100644',type:'blob',sha:sha('b')},
  {path:'server-version/frontend/src/ui.tsx',mode:'100644',type:'blob',sha:sha('c')}
 ];
 const expected=closureDigest('backend-regression',source);
 assert.equal(closureDigest('backend-regression',[source[2],source[0],source[1]]),expected);
 assert.equal(closureDigest('backend-regression',[...source.slice(0,2),{...source[2],sha:sha('d')}]),expected);
 assert.notEqual(closureDigest('backend-regression',[source[0],{...source[1],sha:sha('d')},source[2]]),expected);
 assert.notEqual(closureDigest('frontend',source),closureDigest('frontend',[source[0],source[1],{...source[2],sha:sha('d')}]));
 assert.throws(()=>closureDigest('backend-regression',[...source,source[0]]));
});
test('closure digest accepts real trees whose locale order differs from code-unit order',()=>{
 const paths=['.github/PULL_REQUEST_TEMPLATE.md','.github/config/checks.json','server-version/backend/Dockerfile',
  'server-version/backend/delete-files.js','server-version/backend/ecosystem.config.js','server-version/backend/FORM.md','server-version/scripts/a_b.py','server-version/scripts/a-b.py'];
 const tree=paths.map((path,i)=>({path,mode:'100644',type:'blob',sha:sha(String(i%9))}));
 const digest=closureDigest('backend-regression',tree);
 assert.match(digest,/^[a-f0-9]{64}$/);
 assert.equal(closureDigest('backend-regression',[...tree].reverse()),digest);
 assert.throws(()=>closureDigest('backend-regression',[...tree,tree[0]]));
});
test('cross-run checkpoint accepts only official success with unchanged full closure',()=>{
 const now=Date.parse('2026-11-02T12:00:00Z');
 const tree=[
  {path:'.github/scripts/ci-qualification.mjs',mode:'100644',type:'blob',sha:sha('a')},
  {path:'server-version/backend/src/module.ts',mode:'100644',type:'blob',sha:sha('b')},
  {path:'server-version/frontend/src/editor.test.tsx',mode:'100644',type:'blob',sha:sha('c')}
 ];
 const sourceSha=sha('1'),headSha=sha('2');
 const archiveBytes=Buffer.from('synthetic ZIP archive bytes');
 const archiveDigest=createHash('sha256').update(archiveBytes).digest('hex');
 const current={repository:'caohuibj/eduK12-new-version',pr:601,baseSha:sha('3'),
  headSha,workflowPath:'.github/workflows/ci.yml',workflowDigest:digest('4'),prHeadHistory:[sourceSha,headSha]};
 const proof={schema:1,outcome:'success',check:'backend-regression',repository:current.repository,
  pr:601,baseSha:current.baseSha,sourceSha,workflowPath:current.workflowPath,workflowDigest:current.workflowDigest,
  inputDigest:closureDigest('backend-regression',tree),runId:10,jobId:20,jobName:'backend regression',
  artifactId:30,archiveDigest};
 const run={id:10,head_sha:sourceSha,event:'pull_request',status:'completed',conclusion:'failure',repository:{full_name:current.repository},pull_requests:[{number:601}]};
 const job={id:20,run_id:10,head_sha:sourceSha,status:'completed',conclusion:'success',name:'backend regression',
  completed_at:'2026-11-02T11:00:00Z'};
 const artifact={id:30,workflow_run:{id:10},expired:false,digest:'sha256:'+archiveDigest};
 const args={proof,run,job,artifact,archiveBytes,current,sourceTree:tree,currentTree:tree,now};
 assert.equal(verifyHistoricalSuccess(args).outcome,'REUSED_VERIFIED');
 assert.throws(()=>verifyHistoricalSuccess({...args,currentTree:[tree[0],{...tree[1],sha:sha('e')},tree[2]]}));
 assert.throws(()=>verifyHistoricalSuccess({...args,job:{...job,conclusion:'failure'}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,run:{...run,conclusion:'cancelled'}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,artifact:{...artifact,digest:'sha256:'+digest('6')}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,archiveBytes:Buffer.from('tampered archive')}));
 assert.throws(()=>verifyHistoricalSuccess({...args,run:{...run,pull_requests:[{number:600}]}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,current:{...current,baseSha:sha('7')}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,current:{...current,prHeadHistory:[headSha]}}));
 assert.throws(()=>verifyHistoricalSuccess({...args,now:now+80*3600*1000}));
});
