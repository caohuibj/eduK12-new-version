import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {canonicalSHA256,sha256,sarifIdentity,validateSarifEvidence,validateSarifBundle,verifySarifDisposition,verifyRecordedSarifDisposition,codeqlCollectionInstructions} from './pr356-sarif.mjs';

const head='a'.repeat(40),tree='b'.repeat(40),version='2.23.0';
const script=new URL('./pr356-sarif.mjs',import.meta.url).pathname;
function fixture(language='javascript-typescript',results=[]){
  const files={},prefix=language+'/',source=language==='python'?'python':'javascript',pack='codeql/'+source+'-queries';
  const put=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value));files[prefix+name]=bytes;return {path:prefix+name,sha256:sha256(bytes)};};
  const suitePath='codeql-suites/'+source+'-security-extended.qls';
  const inventory={schemaVersion:1,name:pack,version:'1.2.3',files:[{path:'qlpack.yml',sha256:sha256('name: '+pack),bytes:pack.length+6},{path:suitePath,sha256:sha256('- query: Fixture.ql'),bytes:18}]};
  const expected={schemaVersion:1,sourceHead:head,sourceTree:tree,language,category:'pr356/'+language+'/',
    sourceInputs:put('inputs.json',{sourceHead:head,sourceTree:tree,files:[{path:'fixture/source.'+(source==='python'?'py':'ts'),sha256:sha256('synthetic source')}]}),
    config:put('config.yml','queries:\n  - uses: security-extended\n'),
    cli:{version,bundleSHA256:sha256('fixed official bundle fixture'),versionOutput:put('version.json',{product:'CodeQL',version})},
    queryPacks:[{name:pack,version:'1.2.3',treeSHA256:canonicalSHA256(inventory.files),inventory:put('pack-inventory.json',inventory)}],
    querySuite:{name:'security-extended',packPath:suitePath,...put(suitePath,'- query: Fixture.ql')},
    resolvedQueries:put('queries.json',['/installed/'+pack+'/Fixture.ql']),
    commands:{extract:['/installed/codeql','database','finalize','fixture-db'],analyze:['/installed/codeql','database','analyze','fixture-db',pack+':'+suitePath]},
  };
  const rule={id:source+'/fixture-security',defaultConfiguration:{level:'error'},properties:{'security-severity':'8.1','problem.severity':'error'}};
  const sarif={version:'2.1.0',runs:[{tool:{driver:{name:'CodeQL',semanticVersion:version,rules:[]},extensions:[{name:pack,semanticVersion:'1.2.3',rules:[rule]}]},automationDetails:{id:expected.category},properties:{'semmle.sourceLanguage':source},versionControlProvenance:[{revisionId:head}],results}]};
  expected.sarif=put('analysis.sarif',sarif);
  const receipt={schemaVersion:1,complete:true,partial:false,identity:sarifIdentity(expected),sarifSHA256:expected.sarif.sha256,resolvedQueryCount:1,
    stages:['extract','analyze'].map((name,i)=>({name,status:'completed',exitCode:0,signal:null,partial:false,truncated:false,startedAt:`2026-10-26T0${i}:00:00Z`,endedAt:`2026-10-26T0${i}:01:00Z`,command:expected.commands[name],log:put(name+'.log','actual synthetic '+name+' subprocess output')}))};
  expected.analysis=put('analysis-receipt.json',receipt);
  const f={expected,artifact:{files},sarif,receipt,put};
  f.writeReceipt=()=>{expected.analysis=put('analysis-receipt.json',receipt);};
  f.writeSarif=()=>{expected.sarif=put('analysis.sarif',sarif);receipt.sarifSHA256=expected.sarif.sha256;f.writeReceipt();};
  return f;
}
function finding(source='javascript',extra={}){return {ruleId:source+'/fixture-security',rule:{id:source+'/fixture-security',index:0,toolComponent:{index:0}},message:{text:'Synthetic reviewable finding'},locations:[{physicalLocation:{artifactLocation:{uri:'fixture/source.ts',uriBaseId:'%SRCROOT%'},region:{startLine:7,startColumn:3}}}],partialFingerprints:{primaryLocationLineHash:'fixture:1'},...extra};}
function fixedPolicy(dispositions=[]){const document={schemaVersion:1,id:'explicit-test-policy',allowedDispositions:dispositions};return {state:'fixed',document,sha256:canonicalSHA256(document)};}
function admission(f,policy=fixedPolicy(),reviewRecord){return {plan:{head,tree,sarifPolicy:policy},phase:{id:'codeql-'+f.expected.language,language:f.expected.language,sarifEvidence:f.expected},proof:{phaseId:'codeql-'+f.expected.language,source:{head}},artifact:f.artifact,reviewRecord};}
function reviewed(f,policy){const s=validateSarifEvidence(f.expected,f.artifact);return {schemaVersion:1,reviewer:'claimed-dot-label-is-not-authentication',reviewedAt:'2026-10-26T03:00:00Z',target:{sourceHead:head,sourceTree:tree,language:f.expected.language,sarifSHA256:s.sarifSHA256,queryPackSHA256:s.queryPackSHA256,resultSetSHA256:s.resultSetSHA256,policySHA256:policy.sha256},findings:s.findings.map(x=>({findingId:x.findingId,resultSHA256:x.resultSHA256,disposition:policy.document.allowedDispositions[0],rationale:'Explicit synthetic reviewed decision; no production policy is implied.'}))};}

test('two complete language SARIFs accept legitimate results=[] without claiming release approval',()=>{
  const js=fixture(),py=fixture('python');
  const manifest={schemaVersion:1,sourceHead:head,sourceTree:tree,analyses:{'javascript-typescript':js.expected,python:py.expected}};
  const result=validateSarifBundle(manifest,{files:{...js.artifact.files,...py.artifact.files}});
  assert.equal(result.analyses.length,2);assert.equal(result.findings.length,0);assert(result.analyses.every(a=>a.zeroFindings&&a.runCount===1&&a.queryCount===1));
  assert.equal(result.releaseAuthorized,false);assert.equal(result.externalDotApprovalRequired,true);assert.equal(result.reviewAuthentication,'not-established');
  delete manifest.analyses.python;assert.throws(()=>validateSarifBundle(manifest,js.artifact),/TWO_LANGUAGES_REQUIRED/);
});

test('all findings retain original severity, suppression, baseline and native or derived fingerprints',()=>{
  const f=fixture('javascript-typescript',[finding(),finding('javascript',{level:'none',suppressions:[{kind:'external',status:'accepted'}],baselineState:'unchanged',partialFingerprints:undefined}),finding('javascript',{level:'warning',kind:'review'})]);
  const result=validateSarifEvidence(f.expected,f.artifact);
  assert.equal(result.zeroFindings,false);assert.equal(result.analysisSuccessful,true);assert.equal(result.findings.length,3);
  assert.deepEqual(result.findings.map(x=>x.severity.level),['error','none','warning']);assert.equal(result.findings[0].severity.securitySeverity,'8.1');
  assert.equal(result.findings[0].locations[0].uri,'fixture/source.ts');assert.equal(result.findings[0].locations[0].region.startLine,7);
  assert.equal(result.findings[0].partialFingerprints.primaryLocationLineHash,'fixture:1');assert.equal(result.findings[0].fingerprintSource,'sarif');
  assert.equal(result.findings[1].fingerprintSource,'derived-location-message');assert.equal(result.findings[1].baselineState,'unchanged');assert.equal(result.findings[1].suppressions.length,1);
  assert.equal(new Set(result.findings.map(x=>x.findingId)).size,3);assert.equal(result.releaseAuthorized,false);
});

test('empty, truncated and invalid UTF-8 SARIF are rejected even with matching file digests',()=>{
  for(const bytes of [Buffer.alloc(0),Buffer.from('{"version":"2.1.0","runs":['),Buffer.from([0xff,0xfe,0x7b])]){
    const f=fixture();f.expected.sarif=f.put('analysis.sarif',bytes);f.receipt.sarifSHA256=f.expected.sarif.sha256;f.writeReceipt();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/SARIF_JSON/);
  }
});

test('missing or empty runs and omitted results cannot impersonate zero findings',()=>{
  for(const mutate of [s=>delete s.runs,s=>s.runs=[],s=>delete s.runs[0].results,s=>s.version='2.0.0']){const f=fixture();mutate(f.sarif);f.writeSarif();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/SARIF_(RUNS|RESULTS_MISSING)/);}
});

test('SARIF source, language, category, CLI and query-pack identities must all match',()=>{
  const mutations=[s=>s.runs[0].properties['semmle.sourceLanguage']='python',s=>s.runs[0].automationDetails.id='other/',s=>s.runs[0].tool.driver.semanticVersion='0.0.1',s=>s.runs[0].tool.driver.name='Other Scanner',s=>s.runs[0].tool.extensions[0].semanticVersion='0.0.1',s=>s.runs[0].tool.extensions[0].name='other/pack',s=>s.runs[0].versionControlProvenance[0].revisionId='c'.repeat(40),s=>delete s.runs[0].tool.extensions];
  for(const mutate of mutations){const f=fixture();mutate(f.sarif);f.writeSarif();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/SARIF_/);}
});

test('failed, cancelled, partial, truncated or missing analysis stages are rejected',()=>{
  const mutations=[r=>r.complete=false,r=>r.partial=true,r=>r.stages.pop(),r=>r.stages[0].status='cancelled',r=>r.stages[1].exitCode=1,r=>r.stages[1].signal='SIGTERM',r=>r.stages[1].partial=true,r=>r.stages[1].truncated=true,r=>r.stages[1].startedAt='not-a-time',r=>r.stages[1].command=['/installed/codeql','database','analyze','different-input'],r=>r.resolvedQueryCount=0,r=>r.identity.sourceHead='c'.repeat(40)];
  for(const mutate of mutations){const f=fixture();mutate(f.receipt);f.writeReceipt();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/ANALYSIS_/);}
});

test('split run-queries/interpret-results completion requires both real stages',()=>{
  const f=fixture(),extract=f.receipt.stages[0],analysis=f.receipt.stages[1];
  f.expected.commands={'extract':extract.command,'run-queries':['/installed/codeql','database','run-queries','fixture-db'],'interpret-results':['/installed/codeql','database','interpret-results','fixture-db']};
  f.receipt.stages=[extract,...['run-queries','interpret-results'].map((name,i)=>({...analysis,name,command:f.expected.commands[name],startedAt:`2026-10-26T0${i+1}:00:00Z`,endedAt:`2026-10-26T0${i+1}:01:00Z`}))];f.writeReceipt();
  assert.equal(validateSarifEvidence(f.expected,f.artifact).analysisSuccessful,true);
  f.receipt.stages.pop();f.writeReceipt();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/ANALYSIS_STAGE_COVERAGE/);
});

test('SARIF explicit failure/error/partial diagnostics cannot be accepted as complete',()=>{
  const mutations=[s=>s.runs[0].properties.analysisPartial=true,s=>s.runs[0].invocations=[{executionSuccessful:false}],s=>s.runs[0].invocations=[{executionSuccessful:true,exitCode:2}],s=>s.runs[0].invocations=[{executionSuccessful:true,toolExecutionNotifications:[{level:'error',message:{text:'Extractor error'}}]}],s=>s.runs[0].invocations=[{executionSuccessful:true,toolConfigurationNotifications:[{level:'warning',message:{text:'Analysis is partial'}}]}],s=>s.runs[0].externalPropertyFileReferences={results:[{location:{uri:'missing-results.sarif'}}]}];
  for(const mutate of mutations){const f=fixture();mutate(f.sarif);f.writeSarif();assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/SARIF_/);}
});

test('every retained raw artifact including logs is digest-bound; missing bytes fail closed',()=>{
  const initial=fixture();
  for(const name of Object.keys(initial.artifact.files)){
    const f=fixture();f.artifact.files[name]=Buffer.from('tampered');assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/ARTIFACT_DIGEST/);
    const missing=fixture();delete missing.artifact.files[name];assert.throws(()=>validateSarifEvidence(missing.expected,missing.artifact),/MISSING_ARTIFACT_BYTES/);
  }
});

test('empty resolution and forged pack/input/CLI metadata are rejected after digest verification',()=>{
  const mutate=[f=>{f.expected.resolvedQueries=f.put('queries.json',[]);f.receipt.identity=sarifIdentity(f.expected);f.writeReceipt();},f=>{f.expected.cli.versionOutput=f.put('version.json',{version:'0.0.0'});f.receipt.identity=sarifIdentity(f.expected);f.writeReceipt();},f=>{f.expected.sourceInputs=f.put('inputs.json',{sourceHead:head,sourceTree:tree,files:[]});f.receipt.identity=sarifIdentity(f.expected);f.writeReceipt();},f=>f.expected.queryPacks[0].treeSHA256='d'.repeat(64),f=>f.expected.querySuite.name='default'];
  for(const fn of mutate){const f=fixture();fn(f);assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/PR356_SARIF_/);}
});

test('rule references must resolve uniquely, including grouped extension indexes',()=>{
  const f=fixture('python',[finding('python')]);assert.equal(validateSarifEvidence(f.expected,f.artifact).findings[0].ruleId,'python/fixture-security');
  for(const change of [r=>r.rule.index=12,r=>r.rule.toolComponent.index=4,r=>r.ruleId='wrong/rule']){const broken=fixture('python',[finding('python')]);change(broken.sarif.runs[0].results[0]);broken.writeSarif();assert.throws(()=>validateSarifEvidence(broken.expected,broken.artifact),/RULE_/);}
});

test('pending or self-declared Boolean policy never grants even a zero-finding admission',()=>{
  for(const policy of [undefined,{state:'pending'},true,{state:'fixed',document:{schemaVersion:1,id:'p',allowedDispositions:[]},sha256:'e'.repeat(64)}]){
    const f=fixture(),input=admission(f);input.plan.sarifPolicy=policy;assert.throws(()=>verifySarifDisposition(input),/POLICY_/);
  }
});

test('fixed explicit policy permits machine-complete zero findings while preserving external dot approval',()=>{
  const result=verifySarifDisposition(admission(fixture()));assert.equal(result.status,'accepted');assert.equal(result.phaseId,'codeql-javascript-typescript');assert.equal(result.findings.length,0);
  assert.equal(result.externalDotApprovalRequired,true);assert.equal(result.releaseAuthorized,false);assert.equal(result.reviewAuthentication,'not-established');
});

test('nonzero findings require complete exact reviews and an explicit policy disposition, with no filtering',()=>{
  const f=fixture('javascript-typescript',[finding()]),policy=fixedPolicy(['synthetic-explicit-reviewed-disposition']);
  assert.throws(()=>verifySarifDisposition(admission(f,policy)),/FINDINGS_UNREVIEWED/);
  const review=reviewed(f,policy),result=verifySarifDisposition(admission(f,policy,review));
  assert.equal(result.status,'accepted');assert.equal(result.findings.length,1);assert.equal(result.findings[0].severity.level,'error');assert.equal(result.findings[0].severity.securitySeverity,'8.1');assert.equal(result.reviewAuthentication,'not-established');assert.equal(result.releaseAuthorized,false);
  const noDisposition=reviewed(f,policy);noDisposition.findings[0].disposition='automatic-ignore';assert.throws(()=>verifySarifDisposition(admission(f,policy,noDisposition)),/FINDING_DISPOSITION_REQUIRED/);
  const noPolicy={...admission(f,policy,review),plan:{head,tree,sarifPolicy:{state:'pending'}}};assert.throws(()=>verifySarifDisposition(noPolicy),/POLICY_PENDING/);
});

test('stale head/tree/SARIF/query-pack/result/policy and partial/duplicate review sets are refused',()=>{
  const f=fixture('javascript-typescript',[finding(),finding('javascript',{message:{text:'second result'}})]),policy=fixedPolicy(['synthetic-reviewed']);
  for(const key of ['sourceHead','sourceTree','sarifSHA256','queryPackSHA256','resultSetSHA256','policySHA256']){const review=reviewed(f,policy);review.target[key]='f'.repeat(key.startsWith('source')?40:64);assert.throws(()=>verifySarifDisposition(admission(f,policy,review)),/REVIEW_TARGET/);}
  for(const mutate of [r=>r.findings.pop(),r=>r.findings[1]=r.findings[0],r=>r.findings[0].resultSHA256='f'.repeat(64),r=>r.findings[0].rationale='']){const review=reviewed(f,policy);mutate(review);assert.throws(()=>verifySarifDisposition(admission(f,policy,review)),/REVIEW_COVERAGE|FINDING_DISPOSITION_REQUIRED/);}
});

test('phase, proof source, optional tree and distinct checkout identities bind the approved plan',()=>{
  const mutations=[x=>x.proof.phaseId='codeql-python',x=>x.proof.source.head='c'.repeat(40),x=>x.proof.source.tree='c'.repeat(40),x=>x.plan.tree='c'.repeat(40),x=>x.phase.language='python'];
  for(const mutate of mutations){const input=admission(fixture());mutate(input);assert.throws(()=>verifySarifDisposition(input),/PR356_SARIF_/);}
  const f=fixture();f.expected.checkout='c'.repeat(40);f.sarif.runs[0].versionControlProvenance[0].revisionId=f.expected.checkout;f.writeSarif();const input=admission(f);input.plan.checkout=f.expected.checkout;assert.equal(verifySarifDisposition(input).status,'accepted');delete input.plan.checkout;assert.throws(()=>verifySarifDisposition(input),/PLAN_CHECKOUT/);
});

test('CLI validate/summary/admission use only fixture bytes and fail closed for pending policy or symlinks',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pr356-sarif-fixture-'));
  try{
    const js=fixture(),py=fixture('python'),files={...js.artifact.files,...py.artifact.files};
    const manifest={schemaVersion:1,sourceHead:head,sourceTree:tree,analyses:{'javascript-typescript':js.expected,python:py.expected},sarifPolicy:{state:'pending'},proofs:{'javascript-typescript':admission(js).proof,python:admission(py).proof}};
    for(const [name,bytes] of Object.entries(files)){const p=path.join(directory,name);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,bytes);}
    const filename=path.join(directory,'expected.json');writeFileSync(filename,JSON.stringify(manifest));
    for(const command of ['validate','summary']){const result=JSON.parse(execFileSync(process.execPath,[script,command,filename],{encoding:'utf8'}));assert.equal(result.analyses.length,2);assert.equal(result.releaseAuthorized,false);}
    const pending=spawnSync(process.execPath,[script,'admission',filename],{encoding:'utf8'});assert.equal(pending.status,1);assert.match(pending.stderr,/DISPOSITION_POLICY_PENDING/);
    manifest.sarifPolicy=fixedPolicy();writeFileSync(filename,JSON.stringify(manifest));assert.equal(JSON.parse(execFileSync(process.execPath,[script,'admission',filename],{encoding:'utf8'})).accepted.length,2);
    const input=path.join(directory,js.expected.config.path),replacement=path.join(directory,'config-real.yml');writeFileSync(replacement,files[js.expected.config.path]);rmSync(input);symlinkSync(replacement,input);
    const linked=spawnSync(process.execPath,[script,'validate',filename],{encoding:'utf8'});assert.equal(linked.status,1);assert.match(linked.stderr,/SYMLINK_ARTIFACT/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('collection advice reads actual CLI and pack identities and never starts analysis',()=>{
  assert.deepEqual(codeqlCollectionInstructions.version,['codeql','version','--format=json']);assert.deepEqual(codeqlCollectionInstructions.packs,['codeql','resolve','qlpacks','--format=json']);
  for(const commands of Object.values(codeqlCollectionInstructions.queries)){assert.deepEqual(commands.slice(0,4),['codeql','resolve','queries','--format=json']);assert.match(commands.at(-1),/security-extended\.qls$/);}
  const help=JSON.parse(execFileSync(process.execPath,[script,'help'],{encoding:'utf8'}));assert.equal(help.commands.length,3);
});


test('selected security-extended suite bytes must match the actual resolved pack inventory',()=>{
  const f=fixture();assert.equal(validateSarifEvidence(f.expected,f.artifact).zeroFindings,true);
  f.expected.querySuite={name:'security-extended',packPath:'codeql-suites/javascript-security-extended.qls',...f.put('codeql-suites/javascript-security-extended.qls','- query: DifferentSuite.ql')};
  f.receipt.identity=sarifIdentity(f.expected);f.writeReceipt();
  assert.throws(()=>validateSarifEvidence(f.expected,f.artifact),/QUERY_SUITE_PACK_DIGEST/);
});


test('recorded SARIF disposition shares raw policy and exact review decisions without authenticating raw analysis',()=>{
 const f=fixture('javascript-typescript',[finding()]),policy=fixedPolicy(['synthetic-explicit-reviewed-disposition']),review=reviewed(f,policy),input=admission(f,policy,review);
 const raw=verifySarifDisposition(input),analysis=validateSarifEvidence(f.expected,f.artifact);
 const summary={...analysis,phaseId:input.phase.id,status:'analysis-complete',disposition:'pending',policySHA256:policy.sha256};
 const recorded={plan:input.plan,phaseId:input.phase.id,summary,reviewRecord:review};
 assert.deepEqual(verifyRecordedSarifDisposition(recorded),raw);
 assert.equal(raw.reviewAuthentication,'not-established');assert.equal(raw.releaseAuthorized,false);assert.equal(raw.externalDotApprovalRequired,true);
 for(const mutate of [s=>s.status='accepted',s=>s.disposition='accepted',s=>s.sourceHead='f'.repeat(40),s=>s.sourceTree='f'.repeat(40),s=>s.queryPackSHA256='f'.repeat(64),s=>s.analysisSHA256='',s=>s.policySHA256='f'.repeat(64),s=>s.zeroFindings=true,s=>s.findings=[],s=>s.findings.push(s.findings[0]),s=>s.queryCount=0,s=>s.releaseAuthorized=true]){
  const changed=structuredClone(summary);mutate(changed);assert.throws(()=>verifyRecordedSarifDisposition({...recorded,summary:changed}),/PR356_SARIF_/);
 }
 assert.throws(()=>verifyRecordedSarifDisposition({...recorded,reviewRecord:undefined}),/FINDINGS_UNREVIEWED/);
 const stale=structuredClone(review);stale.findings[0].resultSHA256='f'.repeat(64);assert.throws(()=>verifyRecordedSarifDisposition({...recorded,reviewRecord:stale}),/FINDING_DISPOSITION_REQUIRED/);
 assert.throws(()=>verifyRecordedSarifDisposition({...recorded,plan:{...input.plan,sarifPolicy:{state:'pending'}}}),/POLICY_PENDING/);
 assert.throws(()=>verifyRecordedSarifDisposition({...recorded,summary:true}),/RECORDED_ANALYSIS_STATE/);
 // A structurally complete object is a caller precondition, never an origin
 // credential. No authenticated/rawVerified/dotApproved claim is returned.
 assert.equal(Object.hasOwn(raw,'rawVerified'),false);assert.equal(Object.hasOwn(raw,'dotApproved'),false);
});
