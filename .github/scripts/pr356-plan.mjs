import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const REPOSITORY='caohuibj/eduK12-new-version';
export const BRANCH='fix/runtime-time-and-validation-20261025';
export const REQUIRED_PHASE_IDS=Object.freeze(['backend-image','frontend-image','backend-audit','frontend-audit','schema-upgrade','schema-restore','vertical4','exact-worker1','ordinary-harness4','exact-lazy-current-child','status-browser','product-browser','backend-scan','frontend-scan','codeql-javascript-typescript','codeql-python']);
export const REQUIRED_EVIDENCE_IDS=Object.freeze(['affected-review-contracts','content-grant-time','training-standard-connected','bibliography-axis','catalog-discovery','catalog-instruction','library-management-http','onboarding-pagination','standard-approval-scope','standard-triplet','frontend-app-types','changed-frontend-lint']);
const sha40=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
export const sha256=x=>createHash('sha256').update(x).digest('hex');
export function canonicalJSON(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){assert(Number.isFinite(v),'Nonfinite JSON input');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+v.map(canonicalJSON).join(',')+']';
 assert(v&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null),'Plain JSON object required');
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(v[k])).join(',')+'}';
}
export const canonicalSHA256=v=>sha256(canonicalJSON(v));
export function positiveId(v,name='ID'){
 if(typeof v==='number')assert(Number.isSafeInteger(v),name+' is not a safe integer');
 const s=String(v??'');assert(/^[1-9][0-9]{0,19}$/.test(s),'Missing/invalid '+name);return s;
}
export function relativePath(p){assert(typeof p==='string'&&p.length>0&&!/[\\\x00-\x1f\x7f]/.test(p)&&!p.startsWith('/')&&!p.split('/').some(s=>!s||s==='.'||s==='..'||s==='.git'),'Unsafe repository/artifact path');return p;}
function nonemptyObject(v,label){assert(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length,label+' must be a nonempty object');canonicalJSON(v);}
function strings(v,label){assert(Array.isArray(v)&&v.length&&v.every(x=>typeof x==='string'&&x.trim()===x&&x.length>0&&!/[\x00-\x1f\x7f]/.test(x)),label+' must be nonempty');assert.equal(new Set(v).size,v.length,'Duplicate '+label);return v;}
function exactSet(actual,expected,label){strings(actual,label);assert.deepEqual([...actual].sort(),[...expected].sort(),label+' coverage mismatch');}
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024}).trim();

export function assertPhaseInputs(inputs){
 assert.equal(inputs?.schemaVersion,1);assert(Array.isArray(inputs.files)&&inputs.files.length,'Input file closure missing');
 const seen=new Set();let previous='';
 for(const f of inputs.files){relativePath(f.path);assert(!seen.has(f.path),'Duplicate input file');seen.add(f.path);assert(f.path>previous,'Input file inventory must be sorted');previous=f.path;assert(['100644','100755'].includes(f.mode),'Input must be a regular Git file');assert(sha40(f.blob),'Input blob missing');}
 for(const k of ['configuration','tools','dependencies'])nonemptyObject(inputs[k],'inputs.'+k);
 return inputs;
}
// Identical per-case source closures are stored once per group, never omitted.
export function evidenceInputs(group,c){
 if(c.inputsRef!==undefined){assert.equal(c.inputs,undefined,'Ambiguous historical input representation');assert.match(c.inputsRef,/^[a-f0-9]{64}$/);const inputs=group.inputSets?.[c.inputsRef];assert(inputs,'Historical input set missing');assert.equal(canonicalSHA256(inputs),c.inputsRef,'Historical input set digest drift');return assertPhaseInputs(inputs);}
 return assertPhaseInputs(c.inputs);
}
export function validateAcceptance(a,{requireReady=true}={}){
 assert.equal(a?.schemaVersion,1);assert.equal(a.kind,'pr356-acceptance');assert.equal(a.repository,REPOSITORY);assert.equal(a.pr,356);
 assert(Array.isArray(a.phases));exactSet(a.phases.map(p=>p.id),REQUIRED_PHASE_IDS,'selected phases');
 assert(Array.isArray(a.evidence));exactSet(a.evidence.map(e=>e.id),REQUIRED_EVIDENCE_IDS,'required historical evidence');
 // This one fixed PR356 obligation is fresh production compilation; the
 // original broad/helper diagnostic declaration is retained, never admitted here.
 assert.deepEqual(a.backendProductionTypesCoverage,{"historicalGroupId":"backend-affected-types","historicalCaseId":"backend-affected-types-fbc2c01a2b8de820","phaseId":"backend-image","phaseCaseId":"backend-image-built","qualificationSource":"fresh-phase-only","productionConfig":"server-version/backend/tsconfig.json","excludedSourceGlob":"src/__tests__/**/*","statusAtTransfer":"NOTRUN","priorRawAndStatus":"retained-unchanged"},'Only the fixed backend production type mapping is allowed');
 assert.equal(a.retainedEvidenceDeclarations?.length,1,'Original backend type declaration must be retained');assert.equal(a.retainedEvidenceDeclarations[0].id,'backend-affected-types');assert.deepEqual(a.retainedEvidenceDeclarations[0].caseIds,['backend-affected-types-fbc2c01a2b8de820']);
 assert(a.phases.find(p=>p.id==='backend-image').caseIds.includes('backend-image-built'),'Backend production types require the selected real build check');
 if(requireReady){const policy=a.sarifPolicy;assert.equal(policy?.state,'fixed','SARIF policy must be fixed before qualification');assert.equal(policy.document?.schemaVersion,1);assert.equal(typeof policy.document.id,'string');assert(policy.document.id.length);assert(Array.isArray(policy.document.allowedDispositions));assert(policy.document.allowedDispositions.every(v=>typeof v==='string'&&v.length));assert.equal(new Set(policy.document.allowedDispositions).size,policy.document.allowedDispositions.length);assert.equal(policy.sha256,canonicalSHA256(policy.document),'SARIF policy digest drift');}
 for(const p of a.phases){assert.equal(p.jobName,'pr356-'+p.id);strings(p.caseIds,p.id+' cases');assert(['pending','ready'].includes(p.state));
  assert(Array.isArray(p.inputRoots)&&Array.isArray(p.inputFiles));assert(p.inputRoots.length+p.inputFiles.length>0,'Phase input selectors missing');
  for(const f of [...p.inputRoots,...p.inputFiles])relativePath(f);
  for(const k of ['configuration','tools','dependencies'])nonemptyObject(p[k],p.id+'.'+k);
  assert(Number.isSafeInteger(p.maxAgeSeconds)&&p.maxAgeSeconds>0&&p.maxAgeSeconds<=604800,'Explicit evidence lifetime required');
  assert(Array.isArray(p.acceptedOrigins??[]));
  for(const o of p.acceptedOrigins??[]){for(const k of ['runId','attempt','jobId','artifactId'])positiveId(o[k],k);assert(sha40(o.sourceHead)&&sha40(o.sourceTree));assert.match(o.inputsSHA256,/^[a-f0-9]{64}$/);assert.match(o.zipSHA256,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(o.zipBytes)&&o.zipBytes>0);assert.equal(typeof o.artifactName,'string');assert.match(o.reviewDigest,/^[a-f0-9]{64}$/,'Explicit reviewed origin required');}
  if(requireReady)assert.equal(p.state,'ready','Unimplemented/unreviewed phase: '+p.id);
 }
 for(const e of a.evidence){assert(['pending','approved'].includes(e.state));strings(e.caseIds,e.id+' evidence cases');assert(Array.isArray(e.sourceFiles)&&e.sourceFiles.length);e.sourceFiles.forEach(relativePath);
  if(requireReady){assert.equal(e.state,'approved','Historical evidence not admitted: '+e.id);assert.match(e.reviewDigest,/^[a-f0-9]{64}$/);assert(Array.isArray(e.cases)&&e.cases.length);exactSet(e.cases.map(c=>c.id),e.caseIds,e.id+' evidence records');
   for(const c of e.cases){assert(['passed-case','whole-invocation','execution'].includes(c.scope));assert.match(c.rawSHA256,/^[a-f0-9]{64}$/);evidenceInputs(e,c);assert.equal(c.originalExecutionSigned,false);assert.equal(c.ciExecuted,false);assert.equal(typeof c.contemporaneousSourceManifest,'boolean');if(c.scope!=='execution'){assert.equal(typeof c.fullName,'string');relativePath(c.suiteSuffix);}else{assert.match(c.executionSHA256,/^[a-f0-9]{64}$/);assert.equal(typeof c.exitCodePointer,'string');if(e.id==='frontend-app-types'&&c.id==='frontend-app-types-a31cbf0bebc11a38'&&typeof c.command==='string')assert.equal(c.command,'tsc -p tsconfig.app.json --noEmit','Only the approved original A59 literal command is accepted');else strings(c.command,'historical command');assert.equal(typeof c.commandPointer,'string');assert.match(c.logSHA256,/^[a-f0-9]{64}$/);}}
  }
 }
 return a;
}
function inputInventory(p,head,read){
 const rows=read('ls-tree','-r','-z','--full-tree',head,'--',...p.inputRoots,...p.inputFiles).split('\0').filter(Boolean).map(line=>{
  const m=/^([0-7]{6}) blob ([a-f0-9]{40})\t(.+)$/.exec(line);assert(m,'Unsupported phase input tree entry');return {path:m[3],mode:m[1],blob:m[2]};
 }).sort((a,b)=>a.path.localeCompare(b.path,'en'));
 // JS lexical order is the canonical inventory order; do not depend on locale.
 rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 for(const f of p.inputFiles)assert(rows.some(r=>r.path===f),'Selected phase input missing: '+f);
 for(const root of p.inputRoots)assert(rows.some(r=>r.path===root||r.path.startsWith(root+'/')),'Selected phase input root missing: '+root);
 return assertPhaseInputs({schemaVersion:1,files:rows,configuration:p.configuration,tools:p.tools,dependencies:p.dependencies});
}
function verifyBinding({binding:b,entries,base,head,read}){
 assert.equal(b.schemaVersion,1);assert.equal(b.repository,REPOSITORY);assert.equal(b.pr,356);assert.equal(b.branch,BRANCH);assert(sha40(b.base)&&sha40(b.product));assert.equal(base,b.base,'Frozen base drift');assert(sha40(head));
 nonemptyObject(b.source,'binding.source');strings(b.controls,'controls');nonemptyObject(b.components,'components');nonemptyObject(b.protectedInputs,'protectedInputs');
 const wanted=[...Object.keys(b.source),...b.controls];assert.equal(new Set(wanted).size,wanted.length,'Source/control overlap');assert(Array.isArray(entries));assert.equal(entries.length,wanted.length,'Complete raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length,'Duplicate raw diff entry');
 const inventory=[];
 for(const e of entries){relativePath(e.file);assert(wanted.includes(e.file),'Unknown candidate path: '+e.file);const s=b.source[e.file],old=s?.before??b.controlBefore?.[e.file]??null;
  assert.equal(e.status,s?.status??(old?'M':'A'));assert.equal(e.oldMode,s?.oldMode??(old?'100644':'000000'));assert.equal(e.newMode,s?.newMode??'100644');assert.equal(e.newMode,'100644','Changed source/control must remain regular');assert(['A','M'].includes(e.status),'Deletion/rename refused');
  if(old)assert.equal(read('rev-parse',base+':'+e.file),old,'Before blob drift: '+e.file);
  const after=read('rev-parse',head+':'+e.file);assert(sha40(after));if(s)assert.equal(after,s.after,'Source blob drift: '+e.file);
  inventory.push({path:e.file,status:e.status,oldMode:e.oldMode,newMode:e.newMode,before:old,after});
 }
 inventory.sort((a,b)=>a.path<b.path?-1:1);
 for(const [c,tree]of Object.entries(b.components)){assert(sha40(tree));assert.equal(read('rev-parse',head+':server-version/'+c),tree,'Component tree drift');assert.equal(read('rev-parse',b.product+':server-version/'+c),tree,'Product anchor component drift');}
 for(const [p,blob]of Object.entries(b.protectedInputs)){relativePath(p);assert(sha40(blob));assert.equal(read('rev-parse',head+':'+p),blob,'Protected input drift');}
 return inventory;
}
export function createPr356Plan({binding,acceptance,entries,base,head,context:c,read=git}){
 const inventory=verifyBinding({binding,entries,base,head,read});validateAcceptance(acceptance,{requireReady:c?.phase!=='observe'});
 assert(['qualify','admit','postmerge','observe'].includes(c?.phase),'Unknown PR356 phase');assert.equal(c.repository,REPOSITORY);assert(sha40(c.sourceHead));assert.equal(c.pr?.number,356);assert.equal(c.pr.headRef,BRANCH);assert.equal(c.pr.headRepository,REPOSITORY);assert.equal(c.pr.headSha,c.sourceHead,'Current PR source drift');
 assert(sha40(c.checkoutTree));assert.equal(read('rev-parse',head+'^{tree}'),c.checkoutTree,'Checkout tree drift');assert.equal(read('rev-parse',c.sourceHead+'^{tree}'),c.checkoutTree,'Source/checkout tree drift');
 if(c.phase==='postmerge'){
  assert.equal(c.event,'push');assert.equal(c.branch,'main');assert.equal(c.before,base);assert.equal(c.after,head);assert.equal(c.mainSha,head,'Outdated main push');assert.equal(c.pr.merged,true);assert.equal(c.pr.mergeCommitSha,head);assert.equal(c.commit?.sha,head);assert.equal(c.commit.tree,c.checkoutTree);assert.deepEqual([...c.commit.parents].sort(),[base,c.sourceHead].sort(),'Only exact regular merge parents supported');
 }else{
  assert.equal(c.pr.state,'open');assert.equal(c.pr.merged,false);assert.equal(c.branch,BRANCH);assert.equal(c.mainSha,base,'main advanced');assert.equal(c.pr.baseSha,base,'PR base drift');assert(['workflow_dispatch','pull_request'].includes(c.event));
  if(c.phase==='qualify')assert.equal(c.event,'workflow_dispatch','Qualification is explicit dispatch only');
  if(c.phase==='admit'){assert.equal(c.event,'workflow_dispatch','Merge admission is manual-only');assert.equal(c.pr.draft,false,'Draft cannot receive merge admission');}if(c.phase==='observe')assert.equal(c.event,'pull_request','Observe is a PR metadata route only');
  assert(sha40(c.pr.mergeCommitSha));assert.equal(c.pr.mergeTree,c.checkoutTree,'Official merge tree drift');assert.deepEqual([...c.pr.mergeParents].sort(),[base,c.sourceHead].sort(),'Official merge parents drift');
  assert.equal(head,c.event==='workflow_dispatch'?c.sourceHead:c.pr.mergeCommitSha,'Event checkout identity drift');
 }
 const phases=Object.fromEntries(acceptance.phases.map(p=>{const inputs=inputInventory(p,c.sourceHead,read);return [p.id,{...p,inputs,inputsSHA256:canonicalSHA256(inputs)}];}));
 const plan={schemaVersion:1,route:'pr356',phase:c.phase,repository:REPOSITORY,pr:356,branch:BRANCH,base,head:c.sourceHead,checkout:head,tree:c.checkoutTree,product:binding.product,components:binding.components,protectedInputs:binding.protectedInputs,inventory,inventorySHA256:canonicalSHA256(inventory),bindingSHA256:canonicalSHA256(binding),acceptanceSHA256:canonicalSHA256(acceptance),phases,requiredPhaseIds:[...REQUIRED_PHASE_IDS],historicalEvidence:acceptance.evidence,backendProductionTypesCoverage:acceptance.backendProductionTypesCoverage,retainedEvidenceDeclarations:acceptance.retainedEvidenceDeclarations,sarifPolicy:acceptance.sarifPolicy??{state:'pending'},context:{event:c.event,runId:positiveId(c.runId,'runId'),attempt:positiveId(c.attempt,'attempt'),actualDraft:c.pr.draft,mainSha:c.mainSha,mergeCommitSha:c.pr.mergeCommitSha},qualificationOnly:true,externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
 return {...plan,candidateInputsSHA256:candidateInputsDigest(plan),planSHA256:canonicalSHA256(plan)};
}
export function candidateInputsDigest(p){return canonicalSHA256({schemaVersion:1,repository:p.repository,pr:p.pr,base:p.base,head:p.head,tree:p.tree,product:p.product,components:p.components,protectedInputs:p.protectedInputs,inventorySHA256:p.inventorySHA256,bindingSHA256:p.bindingSHA256,acceptanceSHA256:p.acceptanceSHA256,backendProductionTypesCoverage:p.backendProductionTypesCoverage,phases:Object.fromEntries(Object.entries(p.phases).map(([id,v])=>[id,{jobName:v.jobName,caseIds:v.caseIds,inputsSHA256:v.inputsSHA256,acceptedOrigins:v.acceptedOrigins??[]}]))});}
export function selectedPhaseIds(p){exactSet(p?.requiredPhaseIds,REQUIRED_PHASE_IDS,'plan phases');assert.deepEqual(Object.keys(p.phases).sort(),[...REQUIRED_PHASE_IDS].sort());return [...p.requiredPhaseIds];}
export function compactPlan(p){
 selectedPhaseIds(p);const compact={schemaVersion:p.schemaVersion,route:p.route,phase:p.phase,repository:p.repository,pr:p.pr,branch:p.branch,base:p.base,head:p.head,checkout:p.checkout,tree:p.tree,product:p.product,components:p.components,inventorySHA256:p.inventorySHA256,bindingSHA256:p.bindingSHA256,acceptanceSHA256:p.acceptanceSHA256,candidateInputsSHA256:p.candidateInputsSHA256,requiredPhaseIds:p.requiredPhaseIds,phases:Object.fromEntries(Object.entries(p.phases).map(([id,v])=>[id,{jobName:v.jobName,caseIds:v.caseIds,inputsSHA256:v.inputsSHA256}])),historicalEvidence:p.historicalEvidence.map(e=>({id:e.id,caseIds:e.caseIds,state:e.state})),backendProductionTypesCoverage:p.backendProductionTypesCoverage,retainedEvidenceDeclarations:p.retainedEvidenceDeclarations.map(e=>({id:e.id,caseIds:e.caseIds})),context:p.context,qualificationOnly:true,externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
 assert(Buffer.byteLength(JSON.stringify(compact))<256*1024,'Compact PR356 plan exceeds output budget');return compact;
}
export function pr356Outputs(p){const c=compactPlan(p);return {application_route:'pr356',scenario:'pr356',pr356_phase:p.phase,pr356_plan:JSON.stringify(c),pr356_candidate_inputs_sha256:p.candidateInputsSHA256,codeql:'false',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',post_merge:p.phase==='postmerge'?'true':'false'};}

export async function createContextFromGitHub({env=process.env,eventPayload={},phase=env.PR356_PHASE,token=env.GH_TOKEN,fetcher=fetch,read=git}={}){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,REPOSITORY);assert(['qualify','admit','postmerge','observe'].includes(phase));assert(typeof token==='string'&&token.length,'Official read token missing');
 const api=async path=>{const r=await fetcher('https://api.github.com/repos/'+REPOSITORY+'/'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'Official candidate metadata unavailable: '+path);return r.json();};
 const [raw,main]=await Promise.all([api('pulls/356'),api('git/ref/heads/main')]);
 const mergeSha=raw.merge_commit_sha;assert(sha40(mergeSha),'Official merge commit/preview unavailable');const merge=await api('git/commits/'+mergeSha);
 const head=read('rev-parse','HEAD');assert.equal(head,env.GITHUB_SHA,'Actual checkout/GITHUB_SHA drift');
 const c={phase,event:env.GITHUB_EVENT_NAME,repository:env.GITHUB_REPOSITORY,branch:env.GITHUB_REF_NAME??env.GITHUB_HEAD_REF,sourceHead:raw.head.sha,checkoutTree:read('rev-parse',head+'^{tree}'),mainSha:main.object.sha,runId:positiveId(env.GITHUB_RUN_ID,'runId'),attempt:positiveId(env.GITHUB_RUN_ATTEMPT,'attempt'),pr:{number:raw.number,state:raw.state,merged:raw.merged,draft:raw.draft,headSha:raw.head.sha,headRef:raw.head.ref,headRepository:raw.head.repo.full_name,baseSha:raw.base.sha,mergeCommitSha:mergeSha,mergeTree:merge.tree.sha,mergeParents:merge.parents.map(p=>p.sha)}};
 if(c.event==='pull_request'){assert.equal(eventPayload.pull_request?.number??eventPayload.number,356);c.branch=raw.head.ref;}
 if(phase==='postmerge'){c.before=eventPayload.before;c.after=eventPayload.after;c.commit={sha:mergeSha,tree:merge.tree.sha,parents:merge.parents.map(p=>p.sha)};}
 return c;
}
