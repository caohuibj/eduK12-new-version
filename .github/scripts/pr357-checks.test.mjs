import {test} from 'node:test';import assert from 'node:assert/strict';import {verifyReport} from './pr357-checks.mjs';
const file='src/actual.test.ts';const good={success:true,numFailedTests:0,numPendingTests:0,numPassedTests:1,testResults:[{name:'/app/'+file,status:'passed',assertionResults:[{status:'passed'}]}]};
test('report admission rejects empty, skipped, filtered, failed and missing requested files',()=>{
 assert.equal(verifyReport(good,[file]).passed,1);
 for(const change of [{success:false},{numFailedTests:1},{numPendingTests:1},{numPassedTests:0},{testResults:[]},{testResults:[{...good.testResults[0],assertionResults:[]}]},{testResults:[{...good.testResults[0],assertionResults:[{status:'pending'}]}]}])assert.throws(()=>verifyReport({...good,...change},[file]));
 assert.throws(()=>verifyReport(good,['src/other.test.ts']));
});
import {verifyOriginalArtifact,selectUnfinished,verifyContinuationInputs,artifacts,original} from './pr357-continuation.mjs';
import {binding} from './pr357-scope.mjs';
test('fixed official artifact identity rejects wrong digest, run, source, branch and expiry',()=>{
 const a=artifacts.frontend,now=Date.now(),m={id:a.id,name:a.prefix+original.checkout,expired:false,digest:'sha256:'+a.sha,workflow_run:{id:original.run,head_sha:original.head,head_branch:binding.branch},size_in_bytes:42813,created_at:new Date(now-1000).toISOString()};
 assert.equal(verifyOriginalArtifact(m,'frontend',now).id,a.id);
 for(const delta of [{id:1},{digest:'sha256:'+'0'.repeat(64)},{expired:true},{created_at:new Date(now-86400001).toISOString()},{workflow_run:{...m.workflow_run,id:2}},{workflow_run:{...m.workflow_run,head_sha:'0'.repeat(40)}},{workflow_run:{...m.workflow_run,head_branch:'main'}}])assert.throws(()=>verifyOriginalArtifact({...m,...delta},'frontend',now));
});
test('continuation keeps the failed original intact and accepts only wholly passing files',()=>{
 const old={success:false,numPendingTests:0,testResults:[{name:'/app/src/a.test.ts',status:'passed',assertionResults:[{fullName:'A',status:'passed'}]},{name:'/app/src/b.test.ts',status:'failed',assertionResults:[{fullName:'B1',status:'passed'},{fullName:'B2',status:'failed'}]}]};
 const result=selectUnfinished(old,['src/a.test.ts','src/b.test.ts']);assert.deepEqual(result.accepted,['src/a.test.ts']);assert.deepEqual(result.fresh,['src/b.test.ts']);assert.deepEqual(result.expectedFreshNames,['B1','B2']);assert.equal(result.priorPassedCases,1);assert.equal(old.success,false);
 assert.throws(()=>selectUnfinished({...old,success:true},['src/a.test.ts','src/b.test.ts']));assert.throws(()=>selectUnfinished({...old,numPendingTests:1},['src/a.test.ts','src/b.test.ts']));assert.throws(()=>selectUnfinished(old,['src/a.test.ts','src/c.test.ts']));
});
test('original input reuse rejects any backend drift or another frontend change',()=>{
 const read=(cmd,arg,...rest)=>cmd==='show'?JSON.stringify({tests:binding.tests}):cmd==='diff'?['server-version/frontend/src/huiteacher/HuiteacherAssessmentMediaHost.test.tsx','server-version/frontend/src/school/SchoolBoundContinuation.test.tsx'].join('\n'):arg?.endsWith('^{tree}')?original.tree:original.backendTree;
 assert.equal(verifyContinuationInputs(read).backendTree,original.backendTree);
 assert.throws(()=>verifyContinuationInputs((cmd,arg,...r)=>arg==='HEAD:server-version/backend'?'0'.repeat(40):read(cmd,arg,...r)));
 assert.throws(()=>verifyContinuationInputs((cmd,...r)=>cmd==='diff'?'server-version/frontend/src/school/SchoolApp.tsx':read(cmd,...r)));
});
import {verifyOriginalSastJob} from './pr357-continuation.mjs';
test('application SAST continuation requires exact completed original analysis, not a skipped check',()=>{
 const now=Date.now(),job={id:121952617174,run_id:original.run,head_sha:original.head,name:'codeql (javascript/typescript SAST)',status:'completed',conclusion:'success',completed_at:new Date(now-1000).toISOString(),steps:['initialize CodeQL','analyze with CodeQL'].map(name=>({name,status:'completed',conclusion:'success'}))};
 assert.match(verifyOriginalSastJob(job,now).config,/\.github\/scripts/);
 for(const delta of [{conclusion:'skipped'},{head_sha:'0'.repeat(40)},{run_id:1},{steps:[job.steps[0]]},{steps:job.steps.map(x=>({...x,conclusion:'skipped'}))}])assert.throws(()=>verifyOriginalSastJob({...job,...delta},now));
});
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
test('actual database continuation validates original receipt before fixture work without lexical shadowing',async()=>{
 const source=readFileSync(new URL('./pr357-checks.mjs',import.meta.url),'utf8'),start=source.indexOf('async function database()'),end=source.indexOf('\nasync function main()',start);assert(start>=0&&end>start);const fn=source.slice(start,end),stop=new Error('fixture preparation boundary');let calls=0;
 const context={assert,URL,original,process:{env:{DATABASE_URL:'postgresql://ptool:synthetic@127.0.0.1:5432/pr357_upgrade_ci_test',CI_POSTGRES_SERVICE_ID:'a'.repeat(64)}},testContinuation:async()=>({upgrade:{head:original.checkout,run:String(original.run),status:'PASS',oldUserPreserved:true,migrations:239}}),execFileSync:()=>JSON.stringify([{Config:{Image:'postgres:16.15-bookworm'},State:{Running:true},Mounts:[],NetworkSettings:{Ports:{'5432/tcp':[{HostPort:'5432'}]}}}]),save:()=>{},run:()=>{calls++;throw stop}};
 await assert.rejects(runInNewContext('('+fn+')',context)(),e=>e===stop);assert.equal(calls,1);
 calls=0;await assert.rejects(runInNewContext('('+fn.replaceAll('beforeRestore','original')+')',context)(),/Cannot access 'original' before initialization/);assert.equal(calls,0);
});
import {deliveredFrontend,deliveredArtifacts} from './pr357-continuation.mjs';
test('complete frontend reuse is pinned to its actually successful producer, not the earlier failed run',()=>{
 const now=Date.now(),a=deliveredArtifacts.checks,m={id:a.id,name:a.prefix+deliveredFrontend.checkout,expired:false,digest:'sha256:'+a.sha,workflow_run:{id:deliveredFrontend.run,head_sha:deliveredFrontend.head,head_branch:binding.branch},size_in_bytes:13651,created_at:new Date(now-1000).toISOString()};
 assert.equal(verifyOriginalArtifact(m,'checks',now,true).id,a.id);
 assert.throws(()=>verifyOriginalArtifact({...m,workflow_run:{...m.workflow_run,id:original.run}},'checks',now,true));assert.throws(()=>verifyOriginalArtifact({...m,digest:'sha256:'+artifacts.frontend.sha},'checks',now,true));
});
