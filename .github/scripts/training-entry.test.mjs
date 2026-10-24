import {execFileSync} from 'node:child_process';
import {changedEntries} from './content-scope.mjs';
import {normalizedRestoredSchema,restoredCheckRepresentations} from './training-entry-migration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {binding,branch,marker,trainingEntryPlan,trainingEntryOutputs} from './training-entry-scope.mjs';
import {verifyEvidence,verifyFreshReport,requireApproval,verifyFixedPg,requireMissingRecordApproval,verifyFrontendAuditEvidence,evidenceSourceObject,failedVitestSummary,verifyFixedFrontend,verifyDependencyAuditEvidence,reviewedRecoveryManifest,verifyCompletedBackend} from './training-entry-checks.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
function fixture(){
 const head='a'.repeat(40),source='b'.repeat(40),values={};
 const entries=Object.entries(binding.source).map(([file,s])=>({file,...s}));
 for(const file of binding.controls){const before=binding.controlBefore[file];entries.push({file,status:before?'M':'A',oldMode:before?'100644':'000000',newMode:'100644'});if(before)values[binding.base+':'+file]=before;}
 for(const[file,s]of Object.entries(binding.source)){if(s.before)values[binding.base+':'+file]=s.before;values[head+':'+file]=s.after;}
 for(const[c,t]of Object.entries(binding.components))values[head+':server-version/'+c]=t;
 for(const[f,b]of Object.entries(binding.protectedInputs))values[head+':'+f]=b;
 values[source+'^{tree}']=values[head+'^{tree}']='tree';
 const read=(cmd,arg)=>{assert.equal(cmd,'rev-parse');assert(arg in values,'Unexpected Git input '+arg);return values[arg];};
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:source,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_NUMBER:'999'};
 return {head,source,entries,values,read,env,plan(){return trainingEntryPlan(this.entries,binding.base,this.head,this.read,this.env)}};
}
test('exact Training entry candidate disables unrelated consumers and retains fresh SAST',()=>{const p=fixture().plan(),o=trainingEntryOutputs(p);assert.equal(p.route,'training-entry');for(const k of ['frontend','frontend_build','maintenance','run_performance_tests','ops','media2','cognitive'])assert.equal(o[k],false);assert.equal(o.codeql,true)});
test('other branches retain existing routes',()=>{const f=fixture();assert.equal(trainingEntryPlan([],binding.base,f.head,f.read,{...f.env,CI_HEAD_REF:'other'}),null)});
for(const[name,change]of [
 ['missing marker',f=>f.entries.splice(f.entries.findIndex(e=>e.file===marker),1)],
 ['unknown path',f=>{f.entries[0].file='server-version/backend/new.ts'}],
 ['missing path',f=>f.entries.pop()],['duplicate path',f=>{f.entries[0]=f.entries[1]}],
 ['executable mode',f=>{f.entries[0].newMode='100755'}],['deleted file',f=>{f.entries[0].status='D'}],
 ['changed source',f=>{f.values[f.head+':'+Object.keys(binding.source)[0]]='c'.repeat(40)}],
 ['changed frontend',f=>{f.values[f.head+':server-version/frontend']='c'.repeat(40)}],
 ['changed backend',f=>{f.values[f.head+':server-version/backend']='c'.repeat(40)}],
 ['mismatched merge tree',f=>{f.values[f.source+'^{tree}']='other'}],
 ['wrong repository',f=>{f.env.CI_PR_REPOSITORY='other/repo'}],['wrong branch',f=>{f.env.CI_HEAD_REF='other'}],
 ['missing PR identity',f=>{delete f.env.CI_PR_NUMBER}],['manual request',f=>{f.env.CI_EVENT='workflow_dispatch'}],
 ['full fallback',f=>{f.env.CI_FORCE_FULL='true'}],['full acceptance',f=>{f.env.CI_FULL_ACCEPTANCE='true'}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>f.plan())});
test('base drift is rejected',()=>{const f=fixture();assert.throws(()=>trainingEntryPlan(f.entries,'c'.repeat(40),f.head,f.read,f.env))});
test('only an exact main merge classifies without repeated checks',()=>{const f=fixture();Object.assign(f.env,{CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF_NAME:'main'});const p=f.plan();assert.equal(p.postMerge,true);assert.equal(trainingEntryOutputs(p).codeql,false);f.env.GITHUB_REF_NAME=branch;assert.throws(()=>f.plan())});
test('requires every selected assertion with no filtered or missing files',()=>{const files=['src/one.test.ts'];const r={success:true,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{name:'/runner/src/one.test.ts',assertionResults:[{fullName:'one',status:'passed'}]}]};assert.equal(verifyFreshReport(r,files).cases,1);assert.throws(()=>verifyFreshReport(r,['src/two.test.ts']));r.testResults[0].assertionResults[0].status='pending';assert.throws(()=>verifyFreshReport(r,files));});
test('stable gate requires actual scope qualification and CodeQL, refuses draft or skipped results',()=>{const p=fixture().plan(),outputs=Object.fromEntries(Object.entries(trainingEntryOutputs(p)).map(([k,v])=>[k,String(v)]));const n={scope:{result:'success',outputs},'training-entry':{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','training-entry','codeql']);assert.deepEqual(failedChecks(n,false),[]);assert(failedChecks(n,true).length);for(const result of [undefined,'failure','skipped','cancelled'])for(const job of ['scope','training-entry','codeql']){const a=structuredClone(n);a[job].result=result;assert(failedChecks(a,false).includes(job))}const a=structuredClone(n);a.scope.outputs.frontend='true';assert(failedChecks(a,false).includes('scope'));});


test('no implicit repeat or rebuild permission',()=>{
 for(const key of ['earlyChecksRepeat','frontendRebuild']){
  assert.throws(()=>requireApproval({},key));
  assert.throws(()=>requireApproval({authorization:{[key]:true}},key));
  requireApproval({authorization:{[key]:true,sourceMessage:'Sentinel_0123456789abcdef'}},key);
 }
});
test('tampered or unfrozen local evidence cannot qualify',()=>{
 assert.throws(()=>verifyEvidence(()=>Buffer.from('{}')));
});
test('workflow stays bounded and blocks broad manual probes before any work',()=>{
 const main=readFileSync('.github/workflows/ci.yml','utf8'),wf=readFileSync('.github/workflows/ci-training-entry.yml','utf8');
 assert(main.includes('training_entry_plan: ${{ steps.scope.outputs.training_entry_plan }}'));
 assert(main.includes('uses: ./.github/workflows/ci-training-entry.yml'));
 assert(main.includes("application_route != 'training-entry'"));
 assert(main.includes('"perf/training-entry-20261023","work/measurement-version-final-20261020"'));
 assert(wf.includes('needs: [admission, backend, frontend, browser]'));
 assert(wf.includes('training-entry-checks.mjs build-permission'));
 assert(readFileSync('.github/scripts/training-entry-checks.mjs','utf8').includes('HEAD:.github/scripts/training-entry-migration.mjs'));
 assert(wf.includes('verify complete successful official backend qualification and emitted bytes'));assert(!wf.includes('postgres:17'));
 assert(wf.includes('run current frontend and backend HIGH CRITICAL dependency audits'));
 assert(main.includes('backup/training-survey-main350-20261024'));
 assert(wf.includes('training-entry-browser.mjs'));
 for(const forbidden of ['npm test','npm run typecheck','docker build','migrate deploy','--grep','--passWithNoTests'])assert(!wf.includes(forbidden),forbidden);
});

function evidenceFixture(change=()=>{}){
 const digest=v=>createHash('sha256').update(v).digest('hex'),file='server-version/frontend/src/test.test.tsx',blob='d'.repeat(40),source='e'.repeat(40);
 const inputs={[file]:blob,'server-version/frontend/package.json':blob,'server-version/frontend/package-lock.json':blob};
 const log=Buffer.from('Test Files  1 passed (1)\n     Tests  1 passed (1)\n');
 const record={id:'synthetic-original',sha256:digest(log),bytes:log.length,gzipBase64:gzipSync(log).toString('base64')};
 const controls=binding.controls.filter(f=>!f.endsWith('training-entry-bindings.json')&&!f.startsWith('.github/evidence/'));
 const e={kind:'reviewed-local-evidence',product:binding.product,ciExecuted:false,originalExecutionSigned:false,reviewStatus:'INDEPENDENTLY_REVIEWED',blockers:[],
  controlValidation:{exitCode:0,command:'node --test .github/scripts/training-entry.test.mjs',passed:38,logSHA256:'a'.repeat(64)},limits:['Original execution was unsigned.','Historical full node_modules identity missing.'],controlSHA256:Object.fromEntries(controls.map(f=>[f,digest('control '+f)])),historicalReports:[record],
  groups:[{id:'synthetic',reviewStatus:'INDEPENDENTLY_REVIEWED',reviewNote:'Independent review establishes exact selected original file and its unchanged complete imports.',executions:[{
   source,kind:'whole-file-tests',cwd:'server-version/frontend',command:null,commandSource:'reviewed-historical-scope-reconstruction',commandEvidence:'Retained worker named full-file scope, explicitly not original argv.',reviewedInvocation:{files:[file],filter:null},
   originalExecutionSigned:false,ciExecuted:false,files:[file],inputs,sourceObjectMode:'preserved-reviewed-local-manifest',originalManifestSource:source,originalManifestSHA256:digest(JSON.stringify(inputs)),historicalSourceReconstructed:true,originalManifestReview:'Reviewed immutable local Git source closure, not a contemporaneous cryptographic execution record.',
   reportId:record.id,logSHA256:record.sha256,logBytes:record.bytes,logGzipBase64:record.gzipBase64,observedExitCode:0,failed:0,filtered:0,todo:0,passedAssertions:1,admittedAssertions:1,
  }]}]};
 change(e,e.groups[0].executions[0]);const bytes=Buffer.from(JSON.stringify(e));
 const original={requiredGroups:binding.requiredGroups,evidenceSHA256:binding.evidenceSHA256,reviewedGroupFiles:binding.reviewedGroupFiles,fixedPgCases:binding.fixedPgCases};
 Object.assign(binding,{fixedPgCases:[],requiredGroups:['synthetic'],evidenceSHA256:digest(bytes),reviewedGroupFiles:{synthetic:[file]}});
 try{return verifyEvidence(f=>f.endsWith('/reviewed.json')?bytes:Buffer.from('control '+f),()=>blob);}finally{Object.assign(binding,original);}
}
test('admits only independently reviewed whole-file evidence without invented case names',()=>{const r=evidenceFixture();assert.equal(r.acceptedWholeFiles,1);assert.equal(r.acceptedWholeFileAssertions,1)});
for(const[name,change]of [
 ['filtered scope',(_e,x)=>x.reviewedInvocation.filter='only one'],
 ['filtered original command',(_e,x)=>{x.commandSource='original-record-or-parent-observed-command';x.command='vitest run src/test.test.tsx --testNamePattern=one'}],
 ['false count',(_e,x)=>x.passedAssertions=2],
 ['inferred case identity',(_e,x)=>x.cases=[{name:'fabricated',status:'passed'}]],
 ['failed original invocation',(_e,x)=>x.observedExitCode=1],
 ['skipped original assertions',(_e,x)=>x.filtered=1],
 ['wrong named file',(_e,x)=>{x.files=['server-version/frontend/src/other.test.tsx'];x.reviewedInvocation.files=x.files}],
 ['duplicate file qualification',(e,x)=>e.groups[0].executions.push(structuredClone(x))],
 ['missing required file',(_e,x)=>{x.kind='lint';x.retrospectiveReceipt=true;x.exitEvidence='Observed genuine tool exit, synthetic test fixture';}],
 ['changed imported input without exact review',(_e,x)=>{x.originalInputs={...x.inputs};x.originalInputs[x.files[0]]='f'.repeat(40);x.originalManifestSHA256=createHash('sha256').update(JSON.stringify(x.originalInputs)).digest('hex')}],
])test('historical admission refuses '+name,()=>assert.throws(()=>evidenceFixture(change)));


test('browser consumes exact same-run build bytes and refuses drift without rebuilding',async()=>{
 const {verifyBrowserInput}=await import('./training-entry-checks.mjs');
 const files={'index.html':{sha256:'a'.repeat(64),bytes:1},'.vite/manifest.json':{sha256:'b'.repeat(64),bytes:2}};
 const expected={source:'s',sourceHead:'h',tree:'t',run:'123',attempt:'2'};
 const manifest={...expected,componentTree:'t',attempt:'1',files};
 verifyBrowserInput(manifest,files,expected);
 for(const key of ['source','sourceHead','componentTree','run','attempt'])assert.throws(()=>verifyBrowserInput({...manifest,[key]:key==='attempt'?'3':'wrong'},files,expected));
 assert.throws(()=>verifyBrowserInput(manifest,{},expected));
 assert.throws(()=>verifyBrowserInput(manifest,{...files,'extra.js':files['index.html']},expected));
 assert.throws(()=>verifyBrowserInput(manifest,{...files,'index.html':{sha256:'c'.repeat(64),bytes:1}},expected));
 const wf=readFileSync('.github/workflows/ci-training-entry.yml','utf8');
 const browser=wf.split('  browser:')[1].split('  qualified:')[0];
 assert(browser.includes('needs: frontend'));assert(browser.includes('artifact-ids: ${{ needs.frontend.outputs.artifact }}'));
 assert(browser.includes('training-entry-checks.mjs browser-input'));
 for(const action of ['frontend-build','frontend-later','checks.mjs frontend','checks.mjs lint'])assert(!browser.includes(action));
 assert(wf.includes('["admission","backend","frontend","browser"]'));
 assert(browser.includes('timeout-minutes: 8'));
});


test('complete main workflow reference graph stays within GitHub initialization limit',()=>{
 const seen=new Set(),refs=new Set();
 const visit=path=>{
  if(seen.has(path))return;seen.add(path);
  const source=readFileSync(path,'utf8');
  for(const match of source.matchAll(/^    uses:\s+([^\s#]+)\s*$/gm)){
   const ref=match[1];refs.add(ref);
   if(ref.startsWith('./.github/workflows/'))visit(ref.slice(2));
  }
 };
 visit('.github/workflows/ci.yml');
 assert(refs.size<=50,`GitHub permits 50 unique referenced workflows, found ${refs.size}`);
 assert(!refs.has('./.github/workflows/ci-cognitive-step.yml'));
 assert(refs.has('./.github/workflows/ci-training-entry.yml'));
});

function fixedPgFixture(){
 const digest=v=>createHash('sha256').update(v).digest('hex'),blob='c'.repeat(40);
 const files=[...new Set(binding.fixedPgCases.map(c=>c.file))];
 const sourceInputs=Object.fromEntries(files.map(f=>[f,blob]));
 const cases=binding.fixedPgCases.map(c=>({...c,sourceBlob:blob,originalRunId:c.file}));
 const originalExecutions=files.map(file=>{const selectedCaseNames=cases.filter(c=>c.file===file).map(c=>c.caseName),log=Buffer.from(`Tests ${selectedCaseNames.length} passed`);return {id:file,cwd:'server-version/backend',runnerSHA256:'a'.repeat(64),argv:['node','node_modules/vitest/vitest.mjs','run',file.slice('server-version/backend/'.length)],selectedCaseNames,failedCaseNames:[],failedCount:0,passedCount:selectedCaseNames.length,originalInvocationExit:0,logBytes:log.length,logSHA256:digest(log),logGzipBase64:gzipSync(log).toString('base64')};});
 return {e:{kind:'reviewed-fixed-training-anonymous-pg-12',reviewStatus:'INDEPENDENTLY_REVIEWED_FIXED_12_CASE_MAPPING',ciExecuted:false,originalExecutionSigned:false,currentLocalProduct:binding.localProduct,currentProductTree:binding.productTree,sourceInputs,sourceInputsSHA256:digest(JSON.stringify(sourceInputs)),cases,originalExecutions},object:()=>files.map(f=>`100644 blob ${blob}\t${f}`).join('\n')};
}
test('fixed PG admission is exactly twelve reviewed cases, not whole files',()=>{const f=fixedPgFixture();assert.deepEqual(verifyFixedPg(f.e,f.object),{cases:12,kind:f.e.kind,ciExecuted:false,wholeFileQualification:false});});
for(const [name,change]of [
 ['invented case',f=>f.e.cases[0].caseName+=' unknown'],
 ['missing case',f=>f.e.cases.pop()],
 ['duplicate case',f=>f.e.cases[0]=f.e.cases[1]],
 ['failed case claimed',f=>{const r=f.e.originalExecutions[0];r.failedCaseNames=[r.selectedCaseNames[0]];r.failedCount=1;r.originalInvocationExit=1;}],
 ['lost original output',f=>f.e.originalExecutions[0].logSHA256='0'.repeat(64)],
 ['changed closure',f=>f.object=()=> '100644 blob '+ '0'.repeat(40)+'\t'+f.e.cases[0].file],
])test('fixed PG admission refuses '+name,()=>{const f=fixedPgFixture();change(f);assert.throws(()=>verifyFixedPg(f.e,f.object));});

test('missing-record rerun cannot activate until the bounded user exception is approved',()=>{for(const value of [undefined,false,'true'])assert.throws(()=>requireMissingRecordApproval({missingRecordRevalidationApproved:value}));requireMissingRecordApproval({missingRecordRevalidationApproved:true});});

function frontendAuditFixture(){
 const digest=v=>createHash('sha256').update(v).digest('hex'),r=binding.officialFrontendAudit;
 const stdout=JSON.stringify({auditReportVersion:2,metadata:{vulnerabilities:{high:0,critical:0}}}),manifest='100644 blob '+ 'a'.repeat(40)+'\tserver-version/frontend/package-lock.json';
 const command={id:'frontend-audit',cwd:'server-version/frontend',command:['npm','audit','--package-lock-only','--omit=dev','--audit-level=high','--json'],source:r.checkout,componentTree:r.componentTree,status:'success',exitCode:0,ciExecuted:true,tools:{node:'v24.21.0'},signal:null,error:null,gitInputManifest:manifest,gitInputManifestSHA256:digest(manifest),stdoutSHA256:digest(stdout),stderrSHA256:digest(''),completedAt:r.completedAt};
 return {command,stdout,manifest,now:Date.parse(r.completedAt)+1000};
}
test('frontend audit accepts only its successful exact official subprocess within 24 hours',()=>{const f=frontendAuditFixture();assert.equal(verifyFrontendAuditEvidence(f.command,f.stdout,f.manifest,f.now).fresh,true);assert.equal(verifyFrontendAuditEvidence(f.command,f.stdout,f.manifest,f.now+86400000).fresh,false);});
for(const [name,change]of [
 ['failed subprocess',f=>f.command.exitCode=1],['changed lock manifest',f=>f.manifest+='changed'],
 ['tampered output',f=>f.stdout+=' '],['different source',f=>f.command.source='0'.repeat(40)],
 ['future completion',f=>f.now-=2000],
])test('frontend audit rejects '+name,()=>{const f=frontendAuditFixture();change(f);assert.throws(()=>verifyFrontendAuditEvidence(f.command,f.stdout,f.manifest,f.now));});

 test('evidence maps only current local provenance to the exact published product tree',()=>{const seen=[];const resolve=(cmd,ref)=>{seen.push(ref);assert.equal(cmd,'rev-parse');assert.equal(ref,binding.product+'^{tree}');return binding.productTree};assert.equal(evidenceSourceObject(binding.localProduct,resolve),binding.product);assert.deepEqual(seen,[binding.product+'^{tree}']);});
 test('evidence rejects a published snapshot with different tree bytes',()=>{assert.throws(()=>evidenceSourceObject(binding.localProduct,()=> '0'.repeat(40)),/tree mismatch/);});
 test('evidence never aliases unrelated historical source commits',()=>{const other='1'.repeat(40);assert.equal(evidenceSourceObject(other,()=>{throw Error('unexpected lookup')}),other);});

const schemaFixture=()=>({columns:[{table_schema:'public',table_name:'t',column_name:'a',ordinal_position:1,dtd_identifier:'1',is_nullable:'NO'},{table_schema:'public',table_name:'t',column_name:'b',ordinal_position:4,dtd_identifier:'4',is_nullable:'YES'}],constraints:[],indexes:[],triggers:[],functions:[]});
for(const pair of restoredCheckRepresentations)test('restore canonicalizes only exact CHECK pair '+pair.name,()=>{const a=schemaFixture(),b=schemaFixture();a.constraints=[[pair.table,pair.name,pair.original,true]];b.constraints=[[pair.table,pair.name,pair.restored,true]];assert.deepEqual(normalizedRestoredSchema(a),normalizedRestoredSchema(b));});
test('restore preserves semantic CHECK differences and table identity',()=>{const p=restoredCheckRepresentations[0],a=schemaFixture();a.constraints=[[p.table,p.name,p.original.replace('>= 4','>= 5'),true],['other',p.name,p.original,true],[p.table,p.name,p.original.replace(' AND ',' OR '),false]];assert.deepEqual(normalizedRestoredSchema(a).constraints,a.constraints);});
test('restore normalizes only dropped-column physical gaps and preserves visible order and metadata',()=>{const a=schemaFixture(),b=structuredClone(a);b.columns[1].ordinal_position=2;b.columns[1].dtd_identifier='2';assert.deepEqual(normalizedRestoredSchema(a),normalizedRestoredSchema(b));b.columns.reverse();assert.notDeepEqual(normalizedRestoredSchema(a),normalizedRestoredSchema(b));b.columns.reverse();b.columns[1].is_nullable='NO';assert.notDeepEqual(normalizedRestoredSchema(a),normalizedRestoredSchema(b));});
test('restore rejects unrecognized dtd physical identity',()=>{const a=schemaFixture();a.columns[1].dtd_identifier='unknown';assert.throws(()=>normalizedRestoredSchema(a),/dtd identity/);});
test('failed JSON diagnostics use assertion results rather than synthetic stderr',()=>{const r={success:false,numFailedTests:1,testResults:[{name:'a',status:'failed',assertionResults:[{status:'passed',fullName:'expected synthetic failure'},{status:'failed',fullName:'real mismatch',failureMessages:['expected text']}]}]};assert.deepEqual(failedVitestSummary(r).failures,[{file:'a',name:'real mismatch',messages:['expected text']}]);assert.equal(failedVitestSummary(r).success,false);});

const fixedFrontendProof=()=>JSON.parse(readFileSync('.github/evidence/training-entry/reviewed.json')).fixedFrontendContracts;
test('fixed frontend accepts only reviewed local 420 plus unique retry one',()=>{assert.deepEqual(verifyFixedFrontend(fixedFrontendProof()),{cases:411,originalPassed:420,retryPassed:1,excludedAffected:10,ciExecuted:false,originalExecutionSigned:false});});
test('fixed frontend rejects report tampering',()=>{const e=fixedFrontendProof();e.reports[0].sha256='0'.repeat(64);assert.throws(()=>verifyFixedFrontend(e));});
test('fixed frontend retains original failed invocation',()=>{const e=fixedFrontendProof();e.reports[0].exitCode=0;assert.throws(()=>verifyFixedFrontend(e));});
test('fixed frontend never treats a failed retry as accepted',()=>{const e=fixedFrontendProof();e.reports[1].exitCode=1;assert.throws(()=>verifyFixedFrontend(e));});

function backendAuditFixture(){const f=frontendAuditFixture(),r=binding.officialBackendAudit;f.command={...f.command,id:'backend-audit',cwd:'server-version/backend',source:r.checkout,componentTree:r.componentTree,completedAt:r.completedAt};f.manifest=f.manifest.replace('frontend','backend');f.command.gitInputManifest=f.manifest;f.command.gitInputManifestSHA256=createHash('sha256').update(f.manifest).digest('hex');f.now=Date.parse(r.completedAt)+1000;return f;}
test('backend audit accepts exact successful component subprocess and expires after 24h',()=>{const f=backendAuditFixture();assert.equal(verifyDependencyAuditEvidence(f.command,f.stdout,f.manifest,'backend',f.now).fresh,true);assert.equal(verifyDependencyAuditEvidence(f.command,f.stdout,f.manifest,'backend',f.now+86400000).fresh,false);});
test('backend audit refuses any input drift even with reviewed frontend delta',()=>{const f=backendAuditFixture();assert.throws(()=>verifyDependencyAuditEvidence(f.command,f.stdout,f.manifest+'x','backend',f.now),/Backend dependency inputs changed/);});
test('backend audit refuses failed original subprocess',()=>{const f=backendAuditFixture();f.command.exitCode=1;assert.throws(()=>verifyDependencyAuditEvidence(f.command,f.stdout,f.manifest,'backend',f.now));});
test('evidence preserves earlier compiler source through explicit identical-tree public mapping',()=>{const [source,mapping]=Object.entries(binding.evidenceSourceObjects)[0];assert.equal(evidenceSourceObject(source,(cmd,ref)=>{assert.equal(cmd,'rev-parse');assert.equal(ref,mapping.remote+'^{tree}');return mapping.tree}),mapping.remote);});

// The fourth-run repair may only reverse three independently reviewed blobs;
// no directory, dependency, metadata or additional-file exception is allowed.
test('fourth recovery accepts only the exact reviewed component blob substitutions',()=>{
 const file='server-version/backend/src/form.ts',d={[file]:{before:'a'.repeat(40),after:'b'.repeat(40)}};
 const before=`100644 blob ${d[file].before}\t${file}`,after=`100644 blob ${d[file].after}\t${file}`;
 assert.doesNotThrow(()=>reviewedRecoveryManifest(before,after,'backend',d));
 assert.throws(()=>reviewedRecoveryManifest(before,after+'\n100644 blob '+ 'c'.repeat(40)+'\tserver-version/backend/package.json','backend',d));
 assert.throws(()=>reviewedRecoveryManifest(before,after.replace('100644','100755'),'backend',d));
 assert.throws(()=>reviewedRecoveryManifest(before,after.replace('b'.repeat(40),'c'.repeat(40)),'backend',d));
});
test('fourth recovery cannot use a frontend exception to bypass backend source equality',()=>{
 const d={'server-version/frontend/x.css':{before:'a'.repeat(40),after:'b'.repeat(40)}};
 assert.throws(()=>reviewedRecoveryManifest('before','after','backend',d));
});
test('sixth recovery retains official completed backend and excludes only affected review contracts',()=>{
 const r=binding.officialRecovery;assert.equal(r.failedBackendNames.length,6);assert.equal(new Set(r.failedBackendNames).size,6);
 assert.equal(r.revalidation8Approved,true);assert.equal(r.approvalMessage,'Sentinel_355ab6c09da88191aaf61e8b9d1648f2');
 assert.equal(r.browserRetainedNames.length,25);assert(!r.browserRetainedNames.includes('assessment-deferred-export-retry'));assert.equal(binding.fixedFrontendContracts.retainedPassed,411);assert.equal(binding.fixedFrontendContracts.excludedPriorCount,10);
 const workflow=readFileSync('.github/workflows/ci-training-entry.yml','utf8');assert(workflow.includes('recover-backend'));assert(workflow.includes('recover-browser'));assert(!workflow.includes('training-entry-checks.mjs postgres'));
 assert(!workflow.includes('training-entry-checks.mjs backend-compile'));assert(workflow.includes('training-entry-checks.mjs frontend-build'));
});

test('actual repository diff discovers newly modified main paths outside the former manifest',()=>{
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
 const head=git('rev-parse','HEAD'),actual=changedEntries(binding.base,head);
 const env={CI_EVENT:'pull_request',CI_HEAD_REF:branch,CI_SOURCE_HEAD:head,CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_PR_NUMBER:'351'};
 // Actual Git owns this list. Never manufacture it from binding.source.
 assert.equal(trainingEntryPlan(actual,binding.base,head,git,env).changes.length,actual.length);
 for(const file of Object.keys(binding.officialRecovery.productDeltas)){
  assert(actual.some(entry=>entry.file===file));assert(binding.source[file]);
  const omitted=actual.filter(entry=>entry.file!==file);
  assert.throws(()=>trainingEntryPlan(omitted,binding.base,head,git,env),/Complete raw diff required/);
 }
 const injected=[...actual,{file:'server-version/backend/src/unreviewed-new.ts',status:'A',oldMode:'000000',newMode:'100644'}];
 assert.throws(()=>trainingEntryPlan(injected,binding.base,head,git,env),/Complete raw diff required/);
});

test('completed backend evidence rejects missing files before accepting any qualification',()=>{
 assert.throws(()=>verifyCompletedBackend({},'',{}));
});

test('export recovery retains only official review success and leaves failed export for the new build',()=>{
 const r=binding.officialRecovery;
 assert.equal(r.completedReview.passed,8);
 assert.equal(r.completedReview.file,'src/pages/__tests__/AssignmentList.review-pagination.test.tsx');
 assert(r.browserRetainedNames.includes('assignment-review-paging-batch-download'));
 assert(!r.browserRetainedNames.includes('assessment-deferred-export-retry'));
 assert.deepEqual(binding.checks.frontendTestFiles,['src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx']);
 assert.equal(binding.fixedFrontendContracts.excludedAffectedFiles['server-version/frontend/src/pages/questionnaire/__tests__/DeferredAssessmentDataExport.test.tsx'],3);
 assert.equal(r.backendOrigin.run,binding.completedBackend.run);
 assert.equal(r.backendOrigin.sourceHead,binding.completedBackend.sourceHead);
});
