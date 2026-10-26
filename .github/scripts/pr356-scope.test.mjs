import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {binding,verifyCandidate,refuseUnplannedPR356,officialCandidate} from './pr356-scope.mjs';
const head='a'.repeat(40),base=binding.base;
const entries=()=>[...Object.entries(binding.source).map(([file,v])=>({file,status:v.status,oldMode:v.oldMode,newMode:v.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
function read(_,ref){if(ref.startsWith(base+':')){const p=ref.slice(41);return binding.source[p]?.before||binding.controlBefore[p]}const p=ref.slice(41);return binding.source[p]?.after||binding.protectedInputs[p]||binding.components[p.replace('server-version/','')]}
test('complete immutable application candidate is qualification only',()=>{const p=verifyCandidate(entries(),base,head,read);assert.equal(p.mergeEligible,false);assert.equal(p.qualificationOnly,true)});
test('missing, duplicate, unknown, renamed, executable, base and product drift fail closed',()=>{
 const x=entries();assert.throws(()=>verifyCandidate(x.slice(1),base,head,read));assert.throws(()=>verifyCandidate([...x.slice(1),x[1]],base,head,read));
 for(const change of [{file:'unexpected.ts'},{newMode:'100755'},{status:'R100'}])assert.throws(()=>verifyCandidate(x.map((v,i)=>i? v:{...v,...change}),base,head,read));
 assert.throws(()=>verifyCandidate(x,'b'.repeat(40),head,read));assert.throws(()=>verifyCandidate(x,base,head,()=> 'bad'));
});
test('this branch cannot silently use legacy/full/probe routes',()=>{for(const k of ['CI_HEAD_REF','GITHUB_HEAD_REF','GITHUB_REF_NAME'])assert.throws(()=>refuseUnplannedPR356({[k]:binding.branch}));assert.doesNotThrow(()=>refuseUnplannedPR356({GITHUB_REF_NAME:'main'}))});
test('local or unrelated official identity cannot be impersonated',async()=>{await assert.rejects(officialCandidate({}));await assert.rejects(officialCandidate({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:binding.repository,GITHUB_EVENT_NAME:'pull_request'}))});

// Run the real legacy entry point. It must reject this branch before any
// broad route and must not import the top-level-await candidate CLI back.
test('legacy source CLI refuses PR356 before routing without a verifier import cycle',()=>{
 let error;
 try{execFileSync(process.execPath,[new URL('./content-scope.mjs',import.meta.url).pathname],{env:{...process.env,CI_EVENT:'workflow_dispatch',CI_HEAD_REF:binding.branch},stdio:'pipe',timeout:5000})}catch(e){error=e}
 assert(error);assert.equal(error.status,1);assert.match(error.stderr.toString(),/explicitly authorized bounded qualification dispatch/);assert.doesNotMatch(error.stderr.toString(),/unsettled top-level await|PR356 official candidate metadata unavailable/);
});

// Exercise the actual pre-download Python block, so an empty needs output can
// never silently turn a failed consumer retry into download-all or a rebuild.
test('producer retry inputs accept the successful old attempt and reject missing or unrelated output before download',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const guards=[...workflow.matchAll(/      - name: require exact original producer artifact input\n[\s\S]*?        shell: python\n        run: \|\n([\s\S]*?)(?=      - uses: actions\/download-artifact@v4)/g)];
 assert.equal(guards.length,2);
 const input={...process.env,GITHUB_RUN_ID:'40100000001',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'a'.repeat(40),PR356_ARTIFACT_ID:'90001',PR356_PRODUCER_RUN:'40100000001',PR356_PRODUCER_HEAD:'a'.repeat(40),PR356_PRODUCER_ATTEMPT:'1'};
 for(const[fixture,kind]of [[guards[0],'images'],[guards[1],'dist']]){
  const script=fixture[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
  const good={...input,PR356_ARTIFACT_KIND:kind,PR356_ARTIFACT_NAME:'pr356-'+kind+'-40100000001-1'};
  const invoke=env=>execFileSync('python3',['-c',script],{env,stdio:'pipe'});
  assert.doesNotThrow(()=>invoke(good));assert.doesNotThrow(()=>invoke({...good,GITHUB_RUN_ATTEMPT:'1'}));
  for(const patch of [{PR356_ARTIFACT_NAME:''},{PR356_ARTIFACT_ID:''},{PR356_PRODUCER_RUN:'40100000002'},{PR356_PRODUCER_HEAD:'b'.repeat(40)},{PR356_PRODUCER_ATTEMPT:'3'},{PR356_ARTIFACT_NAME:'pr356-'+kind+'-40100000001-2'}])assert.throws(()=>invoke({...good,...patch}));
 }
});

test('historical observation bytes and collection identity remain old while current candidate changes',async()=>{
 const {verifyDevelopmentObservations,originalObservationAnchor}=await import('./pr356-evidence.mjs');
 const e=JSON.parse(readFileSync(new URL('./pr356-local-evidence.json',import.meta.url),'utf8')),current={product:'e'.repeat(40),components:{backend:'f'.repeat(40),frontend:'d'.repeat(40)}};
 const summary=verifyDevelopmentObservations(e,current);
 assert.deepEqual(summary.historicalAnchor,originalObservationAnchor);assert.equal(summary.product,originalObservationAnchor.product);assert.deepEqual(summary.currentCandidate,current);assert.equal(summary.qualificationClaim,false);
 for(const mutate of [x=>x.product=current.product,x=>x.components=current.components,x=>x.reports.pop(),x=>x.reports[0].rawBase64='e30=']){
  const changed=structuredClone(e);mutate(changed);assert.throws(()=>verifyDevelopmentObservations(changed,current));
 }
});


test('followup bytes preserve execution receipts without becoming a signed/current qualification',async()=>{
 const {verifyDevelopmentObservations}=await import('./pr356-evidence.mjs');
 const e=JSON.parse(readFileSync(new URL('./pr356-local-evidence.json',import.meta.url),'utf8'));
 const raw=Buffer.from(JSON.stringify({exitCode:0,bytes:0,sha256:createHash('sha256').update('').digest('hex'),command:'synthetic unit fixture receipt'}));
 e.followupAttachments=[{path:'unit-fixture/execution-receipt.json',sha256:createHash('sha256').update(raw).digest('hex'),rawBase64:raw.toString('base64')}];
 delete e.followupSourceAssociation;
 assert.throws(()=>verifyDevelopmentObservations(e));
 e.followupSourceAssociation={kind:'working-tree-observation',contemporaneousSourceManifest:false,originalExecutionSigned:false,qualificationClaim:false};
 const summary=verifyDevelopmentObservations(e);assert.equal(summary.qualificationClaim,false);assert.equal(summary.followupAttachments[0].bytes,raw.length);assert.equal(summary.followupAttachments[0].rawBase64,undefined);
 for(const patch of [{contemporaneousSourceManifest:true},{originalExecutionSigned:true},{qualificationClaim:true}])assert.throws(()=>verifyDevelopmentObservations({...e,followupSourceAssociation:{...e.followupSourceAssociation,...patch}}));
 const corrupted=structuredClone(e);corrupted.followupAttachments[0].rawBase64='e30=';assert.throws(()=>verifyDevelopmentObservations(corrupted));
});
