// One bounded, independently reviewed original set. No execution, signing,
// environment reconstruction, mutable URLs or arbitrary evidence providers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
export const selection=data=>data.reports.map(r=>({group:r.group,sha256:r.report.sha256,selected:r.selected.map(index=>({index,...r.report.cases[index],branchReview:r.caseBranches[index]}))}));
export const readNativeEvidenceBytes=()=>readFileSync(new URL('./school-teacher-native-evidence.json',import.meta.url));
export function verifyNativeEvidence(bytes,b,helpers,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()){
 assert(helpers?.inspectHistoricalCase&&helpers?.requireReviewedCase,'Native application assertions not admitted without original byte readers');
 assert.equal(hash(bytes),b.evidence.manifestSha256,'Reviewed original manifest changed');
 const data=JSON.parse(bytes);assert.equal(data.kind,'bounded-native-bundle-reviewed-local-evidence');assert.equal(data.schemaVersion,1);
 assert.equal(hash(canonical(data.review)),data.reviewSha256);assert.equal(data.reviewSha256,b.evidence.reviewSha256);
 assert.equal(data.review.originalExecutionSigned,false);assert.equal(data.review.originalEnvironmentFullyBound,false);
 assert.equal(hash(canonical(data.inputClosure)),data.inputClosureSha256);assert.equal(hash(canonical(selection(data))),b.evidence.selectionSha256);
 assert.deepEqual(data.inputClosure.trees,{frontend:b.frontendTree,backend:b.backendTree});
 for(const [component,tree]of Object.entries(data.inputClosure.trees))assert.equal(git('rev-parse','HEAD:server-version/'+component),tree,'Current consumer tree drift');
 for(const [path,blob]of Object.entries(data.inputClosure.files))assert.equal(git('rev-parse','HEAD:'+path),blob,'Current lock/schema drift');
 const originals=new Map();
 for(const [path,f]of Object.entries(data.files)){
  assert(!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'));assert(Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=1024*1024);
  const compressed=Buffer.from(f.gzipBase64,'base64');assert.equal(compressed.toString('base64'),f.gzipBase64);
  const raw=gunzipSync(compressed,{maxOutputLength:f.bytes});assert.equal(raw.length,f.bytes);assert.equal(hash(raw),f.sha256);originals.set(path,raw);
 }
 const raw=path=>{assert(originals.has(path),'Missing actual original '+path);return originals.get(path)};
 const admitted=[],supplements=[],covered=new Set(),keys=new Set();
 const finalReviewed=b.enabled===true&&b.review?.status==='INDEPENDENTLY_REVIEWED'&&/^[a-f0-9]{64}$/.test(b.review.recordSha256??'');
 for(const r of data.reports){
  const parsed=JSON.parse(raw(r.file)),actual=parsed.testResults.flatMap(s=>s.assertionResults??[]).map(a=>({name:a.fullName,status:a.status}));
  assert.deepEqual(actual,r.report.cases,'Original failed/filtered rows changed');assert.equal(r.report.invocationSuccess,parsed.success===true);
  assert.equal(r.report.sha256,hash(raw(r.file)));assert(r.selected.length&&r.branchReview.length>40);assert.deepEqual(Object.keys(r.caseBranches).sort(),r.selected.map(String).sort());
  if(r.shellExitFile)assert.equal(Number(raw(r.shellExitFile).toString().trim()),r.originalShellExit);else assert.equal(r.originalShellExit,null,'Missing exit cannot become zero');
  const group={originalExecutionSigned:false,ciExecuted:false,reviewStatus:'INDEPENDENTLY_REVIEWED',reviewSha256:data.reviewSha256,inputClosure:{sha256:data.inputClosureSha256},admittedCaseKeys:r.selected.map(i=>r.report.sha256+':'+i)};
  for(const index of r.selected){
   const key=r.report.sha256+':'+index;assert(!keys.has(key),'Overlapping original assertion');keys.add(key);assert(r.caseBranches[index].length>40);
   const found=helpers.inspectHistoricalCase(group,r.report,index,raw(r.file));assert.equal(found.status,'passed');
   const pending=r.group==='AUDIT'&&!finalReviewed;
   const accepted=pending?{...found,historicalKind:'recorded-local-supplement-pending-final-review'}:helpers.requireReviewedCase(group,r.report,index,found);
   let offset=0,suiteIndex=-1,rowIndex=-1;
   for(const [i,suite]of parsed.testResults.entries()){const length=suite.assertionResults.length;if(index<offset+length){suiteIndex=i;rowIndex=index-offset;break}offset+=length}
   assert(suiteIndex>=0);(pending?supplements:admitted).push({...accepted,group:r.group,rawSha256:r.report.sha256,index,suiteIndex,rowIndex,originalShellExit:r.originalShellExit,branchReview:r.caseBranches[index]});
  }
  covered.add(r.group);
 }
 const observations=[];
 for(const o of data.observations){
  assert(o.id&&!covered.has(o.id));covered.add(o.id);assert(o.scope.length>40);
  if(o.kind==='reached-school-publication'){
   const text=raw(o.file).toString().split('\n'),segment=text.slice(o.publicationLine,o.publicationLine+9).join('\n');
   assert(segment.includes('UPDATE education_assessment_deliveries')&&segment.includes('published_by_user_id')&&segment.includes('published_at'));
   assert(o.commitLine>o.publicationLine&&text[o.commitLine].endsWith('COMMIT'));
   assert.equal(JSON.parse(raw(o.reportFile)).success,false);observations.push({id:o.id,scope:o.scope,wholeInvocationSuccess:false,reachedStageOnly:true});continue;
  }
  const value=JSON.parse(raw(o.file));assert.deepEqual(value,o.expected,'Original observation changed');assert.equal(value.status,'PASS');
  if(o.kind==='development-report-browser'){assert(value.checks.length&&value.checks.some(s=>s.includes('390px')));assert(value.sourceCommit);}
  else if(o.kind==='original-training-http'){
   assert.equal(o.originalShellExit,null);assert.equal(value.replayed,true);assert.equal(value.profileId,'P4');assert.equal(value.receipts.length,2);
   assert(raw(o.runner).toString().includes("root+'evc-http-result.json'"));
  }else if(o.kind==='new-read-only-links'){
   assert.equal(value.readOnly,'on');assert.equal(value.database,'eduk12_test');assert.equal(value.scoringCalls,0);assert.equal(value.profileCalls,0);assert.equal(value.publicationOrFinalWrites,false);
   assert.deepEqual(value.code.backendTree,b.backendTree);assert.deepEqual(value.code.frontendTree,b.frontendTree);assert.equal(value.scriptSha256,hash(raw(o.runner)));
   const command=JSON.parse(raw(o.command));assert.equal(command.exitCode,0);assert.equal(command.testSHA256,value.scriptSha256);assert.equal(command.configSHA256,hash(raw(o.config)));
   assert.deepEqual(value.cases.map(c=>c.product),['TRAINING','SCHOOL']);
   for(const c of value.cases){assert.equal(c.initialCount,1);assert.equal(c.snapshotCount,3);assert.equal(c.singleReportCount,2);assert.equal(c.singles.length,2);assert.equal(c.profileId,'P4');assert.equal(c.storedFactsHashVerified,true);}
   assert.equal(JSON.parse(raw(o.staticPackageLink)).packageHash,value.cases[0].sourceLink.releaseContentHash);
   assert.equal(value.cases[1].sourceLink.execution.runtimeBindingRef,value.cases[1].attemptId);
  }else assert.fail('Unknown bounded observation');
  observations.push({id:o.id,kind:o.kind,scope:o.scope,originalExecutionSigned:false,ciExecuted:false,...(['T-HTTP','LINKS'].includes(o.id)&&!finalReviewed?{pendingFinalReview:true}:{})});
 }
 assert.deepEqual(Object.keys(data.coverage),b.evidence.obligations);for(const ids of Object.values(data.coverage)){assert(ids.length);for(const id of ids)assert(covered.has(id),'Missing required original coverage '+id)}
 const pendingFinalReview=supplements.length>0||observations.some(o=>o.pendingFinalReview);
 return {status:pendingFinalReview?'ORIGINALS_VERIFIED_SUPPLEMENT_PENDING_FINAL_REVIEW':'VERIFIED_REVIEWED_LOCAL_EVIDENCE',pendingFinalReview,historicalKind:'reviewed-local-evidence',originalExecutionSigned:false,originalEnvironmentFullyBound:false,applicationTestsExecutedInCI:false,manifestSha256:hash(bytes),admittedCases:admitted,recordedSupplements:supplements,observations,limitations:data.review.limitations};
}
