/** New real A/B compiled, service-free contracts only. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn,spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {startObservedAnalysisApi} from './c25-c26-analysis-api.mjs'
const require=createRequire(import.meta.url),artifact=require('./c25-c26-analysis-artifacts.cjs'),file=name=>fileURLToPath(new URL(name,import.meta.url))
const ROOT='/workspace/scratch/5a77e8bdc1ae',env={PATH:process.env.PATH,NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',DATABASE_URL:'postgresql://eduk12_runtime:fixture@127.0.0.1:54399/eduk12_c25_joint_restore',UPLOAD_DIR:ROOT+'/eduk12_c25_http_01/uploads',EXPORT_DIR:ROOT+'/eduk12_c25_http_01/exports'}
test('fixed A and independently emitted B keep full inventory and actual static dependencies and JSON resources',()=>{
 for(const arm of ['A','B']){
  const script=`const a=require(${JSON.stringify(file('c25-c26-analysis-artifacts.cjs'))});const s=a.selectAnalysisArtifact(${JSON.stringify(arm)},{full:true});process.stdout.write(JSON.stringify(a.analysisResolutionProof(s)))`
  const r=spawnSync(process.execPath,['-e',script],{cwd:artifact.BACKEND,env:{...env,NODE_PATH:artifact.BACKEND+'/node_modules',NODE_DISABLE_COMPILE_CACHE:'1'},timeout:15000,maxBuffer:1024**2,encoding:'utf8'})
  assert.ifError(r.error);assert.equal(r.status,0,r.stderr);const proof=JSON.parse(r.stdout)
  assert.equal(proof.arm,arm);assert.equal(proof.servicesStarted,false);assert.equal(proof.jsonResources.length,49);assert.ok(proof.staticApplicationFiles>300)
  fs.writeFileSync(path.join(process.env.C26_PREPARE_EVIDENCE_ROOT,`resolution-${arm}.json`),r.stdout,{mode:0o600,flag:'wx'})
 }
 assert.throws(()=>artifact.selectAnalysisArtifact('C'))
 assert.throws(()=>artifact.analysisArtifactEnvironment('B',{...env,NODE_PATH:'/tmp/unbound-dependencies'}))
 assert.throws(()=>artifact.analysisArtifactEnvironment('B',{...env,UPLOAD_DIR:'/tmp/unbound-materials'}))
})
test('actual compiled A versus B pure fixed-input full outputs and scientific failures remain exactly equal',()=>{
 const result=spawnSync(process.execPath,['-e',`
 const assert=require('node:assert/strict'),a=require(${JSON.stringify(file('c25-c26-analysis-artifacts.cjs'))});
 const A=require(a.selectAnalysisArtifact('A').dist+'/modules/training-analysis/core.js'),B=require(a.selectAnalysisArtifact('B').dist+'/modules/training-analysis/core.js');
 function fixture(n){const request={schemaVersion:1,courseId:'synthetic',mode:'PAIRWISE',waves:[0,1].map(i=>({waveKey:'w'+i,taskId:'t'+i,publication:'2026-10-01T00:00:00.000Z',configDigest:null,variantKey:null,metrics:[{itemId:'i'+i,metricKey:'total'}]}))};const source={schemaVersion:1,courseId:'synthetic',observations:request.waves.flatMap((w,i)=>Array.from({length:n},(_,p)=>({participantKind:'USER',participantKey:'p'+p,waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,itemId:'i'+i,metricKey:'total',attemptId:'a'+i+'-'+p,attemptEpoch:1,sourceHashes:{result:'a'.repeat(64)},value:p+i,reason:null,measurement:{instrumentKey:'scale',scoreKey:'total',scoringDigest:'b'.repeat(64),responseSignature:'c'.repeat(64),respondentType:'SELF',unit:'score',version:'1'},originalFinalStatus:'COMPLETED',taskSatisfied:true})))};return {request,source}}
 for(const n of [1,4,5]){const f=fixture(n),before=structuredClone(f),view=B.buildTrainingAnalysisView(f.request,f.source);assert.deepEqual(view.analysis,A.buildTrainingAnalysis(f.request,f.source));assert.deepEqual(view.dictionary,A.buildTrainingDictionary(f.request,f.source));assert.deepEqual(view.tables,A.buildTrainingAnalysisTables(f.request,f.source));assert.equal(view.analysis.state,n<5?'suppressed':'present');assert.deepEqual(f,before)}
 const error=fn=>{try{fn();assert.fail('expected rejection')}catch(e){return {name:e.name,code:e.code,statusCode:e.statusCode,message:e.message}}};
 for(const mutate of [f=>f.source.courseId='wrong',f=>f.source.observations[0].measurement.scoringDigest='d'.repeat(64),f=>f.source.observations.push(f.source.observations[0])]){const f=fixture(5);mutate(f);assert.deepEqual(error(()=>A.buildTrainingAnalysis(f.request,f.source)),error(()=>B.buildTrainingAnalysisView(f.request,f.source)))}
 assert.ok(!Object.keys(require.cache).some(p=>p.endsWith('/config/database.js')));process.stdout.write(JSON.stringify({passed:true,n:[1,4,5],badIdentityCases:3,fullOutputEquality:true,databaseImported:false}));
 `],{cwd:artifact.BACKEND,env:{...env,NODE_PATH:artifact.BACKEND+'/node_modules',NODE_DISABLE_COMPILE_CACHE:'1'},timeout:10000,maxBuffer:1024**2,encoding:'utf8'})
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);fs.writeFileSync(path.join(process.env.C26_PREPARE_EVIDENCE_ROOT,'compiled-pure.json'),result.stdout,{mode:0o600,flag:'wx'})
})
test('both actual A/B leaf paths install one real consumer probe before load and close without services',{timeout:15000},async()=>{
 for(const arm of ['A','B']){
  const directory=fs.mkdtempSync(path.join(process.env.C26_PREPARE_EVIDENCE_ROOT,'artifact-api-'+arm+'-'));fs.chmodSync(directory,0o700)
  const end=performance.now()+6000,events=[],faults=[];let api
  try{
   api=await startObservedAnalysisApi({arm,directory,node:process.execPath,env:{...env,C26_API_FIXTURE_DIRECTORY:directory},remainingMs:()=>end-performance.now(),record:x=>events.push(x),onFault:e=>faults.push(e),register:async identity=>fs.writeFileSync(path.join(directory,'registered.json'),JSON.stringify(identity),{mode:0o600,flag:'wx'})},
    {spawnChild:(node,argv,options)=>spawn(node,['--import',file('c25-c26-analysis-api-fixture.mjs'),...argv],options)})
   const one=await api.snapshot(),two=await api.snapshot();assert.equal(one.sql.events,1);assert.equal(two.sql.events,1);assert.equal(two.sql.durationMs,2.5)
   const closed=await api.stop();assert.equal(closed.passed,true);assert.deepEqual(closed.exit,{code:0,signal:null});assert.equal(closed.groupQuiescent,true);assert.equal(closed.arm,arm)
   const proof=JSON.parse(fs.readFileSync(path.join(directory,'fixture-events.jsonl'),'utf8').trim());assert.equal(proof.prismaSame,true);assert.ok(proof.database.startsWith(artifact.selectAnalysisArtifact(arm).dist+'/'));assert.equal(faults.length,0)
  }finally{if(api)await api.stop()}
 }
})
