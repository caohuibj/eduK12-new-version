import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {binding} from './survey-workspace-scope.mjs';
import {verifyApplicationDelta,verifyRun,verifyJob,verifyBrowser,verifyCompiledRun} from './survey-workspace-reuse.mjs';
const css='server-version/frontend/src/survey/survey-appearance.css',old='.bg-slate-50,.bg-gray-50',current='.bg-slate-50,.bg-slate-100,.bg-gray-50';
const read=(command,...args)=>command==='diff'?css:command==='show'?(args[0].startsWith('HEAD:')?current:old):args[0]==='HEAD:server-version/backend'?binding.resume.backendTree:'fixed-input';
const run={id:39811690734,head_sha:'90ca44116069071224ffcef735680fd708955df4',head_branch:'work/survey-visual-20261022',event:'pull_request',run_attempt:1,path:'.github/workflows/ci.yml',pull_requests:[{number:336}],conclusion:'failure'};
const report=()=>({status:'running',compiledDist:true,syntheticOnly:true,pageErrors:[],unexpectedRequests:[],checks:[...['entry-settings','form','scale','scale-application','composition','publish','reports'].map(scene=>({scene,width:1440,theme:'dark',overflow:false,white:[],violations:[]})),{scene:'data',width:1440,violations:[{id:'color-contrast'}]}]});
test('admits only the one analytics utility mapping while every runtime JS/TS/config and backend stays fixed',()=>{assert.equal(verifyApplicationDelta(read).run,39811690734);});
test('rejects any other application path, arbitrary CSS edit or executor/config drift',()=>{
 assert.throws(()=>verifyApplicationDelta((command,...args)=>command==='diff'?css+'\nserver-version/frontend/src/survey/SurveyApp.tsx':read(command,...args)));
 assert.throws(()=>verifyApplicationDelta((command,...args)=>command==='show'&&args[0].startsWith('HEAD:')?current+' unexpected':read(command,...args)));
 assert.throws(()=>verifyApplicationDelta((command,...args)=>command==='rev-parse'&&args[0]==='HEAD:.github/scripts/survey-workspace-fixture.mjs'?'drift':read(command,...args)));
});
test('retains the overall failure and rejects wrong original PR/head/attempt/workflow identity',()=>{
 verifyRun(run);for(const patch of [{head_sha:'a'.repeat(40)},{id:1},{run_attempt:2},{conclusion:'success'},{pull_requests:[]},{path:'another.yml'}])assert.throws(()=>verifyRun({...run,...patch}));
});
test('requires exact successful official stages and rejects skipped, failed or expired component jobs',()=>{
 const now=Date.now(),j={id:11,run_id:39811690734,name:'official',status:'completed',conclusion:'success',completed_at:new Date(now).toISOString(),steps:[{name:'required',status:'completed',conclusion:'success'}]};verifyJob(j,11,'official',['required'],now);
 for(const patch of [{conclusion:'failure'},{status:'in_progress'},{completed_at:new Date(now-86400001).toISOString()},{steps:[{name:'required',status:'completed',conclusion:'skipped'}]},{run_id:1}])assert.throws(()=>verifyJob({...j,...patch},11,'official',['required'],now));
});
test('accepts exactly seven desktop scenes and never the failed data scene or unexecuted narrow scenes',()=>{
 const accepted=verifyBrowser(report());assert.equal(accepted.length,7);assert.ok(accepted.every(x=>x.width===1440&&x.scene!=='data'));
});
test('rejects hidden failures, missing scenarios and changed original browser data',()=>{
 for(const mutate of [r=>r.checks.pop(),r=>r.checks[0].violations.push({id:'color-contrast'}),r=>r.checks[0].width=390,r=>r.checks[7].violations=[],r=>r.pageErrors.push('render error')]){const r=report();mutate(r);assert.throws(()=>verifyBrowser(r));}
});
test('keeps compiled artifact and missing browser/SAST work mandatory while backend reuses its real successful job',()=>{
 const workflow=readFileSync('.github/workflows/ci-survey-workspace.yml','utf8'),ci=readFileSync('.github/workflows/ci.yml','utf8');assert.doesNotMatch(workflow,/npm run build|install --with-deps/);assert.match(workflow,/survey-workspace-reuse.mjs frontend/);assert.match(workflow,/install chromium/);assert.match(workflow,/fc-list :lang=zh/);assert.match(workflow,/sha256sum --check/);assert.match(workflow,/https:\/\/archive\.ubuntu\.com/);assert.match(workflow,/survey-workspace-reuse.mjs backend/);assert.doesNotMatch(workflow,/services:|prisma.*generate|migrate deploy/);assert.match(workflow,/actions\/download-artifact@v4/);assert.match(ci,/verify official Survey application SAST/);assert.match(ci,/survey-workspace-reuse.mjs sast/);
});

test('accepts the compiled run only with exact original identity and a fresh bounded age',()=>{
 const now=Date.now(),r={id:39814196927,head_sha:'340a952b77646c72eec2b437795d9b71f022b2c9',head_branch:'work/survey-visual-20261022',event:'pull_request',run_attempt:1,path:'.github/workflows/ci.yml',pull_requests:[{number:336}],created_at:new Date(now).toISOString(),conclusion:null};verifyCompiledRun(r,now);
 for(const patch of [{head_sha:'a'.repeat(40)},{run_attempt:2},{pull_requests:[]},{conclusion:'success'},{created_at:new Date(now-86400001).toISOString()}])assert.throws(()=>verifyCompiledRun({...r,...patch},now));
});
test('compiled frontend success cannot come from another run or a missing successful compile step',()=>{
 const now=Date.now(),j={id:119948529906,run_id:39814196927,name:'survey-workspace / frontend',status:'completed',conclusion:'success',completed_at:new Date(now).toISOString(),steps:[{name:'compile frontend exactly once',status:'completed',conclusion:'success'}]};
 const check=x=>verifyJob(x,119948529906,'survey-workspace / frontend',['compile frontend exactly once'],now,39814196927);check(j);for(const patch of [{run_id:39811690734},{conclusion:'cancelled'},{steps:[]}])assert.throws(()=>check({...j,...patch}));
});
