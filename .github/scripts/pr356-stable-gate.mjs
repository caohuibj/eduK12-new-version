/** Stable gate adapter only. Source and original official evidence remain the
 * authority; needs success or a local boolean cannot issue merge admission. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {validatePr356GateNeeds} from './pr356-gate-contract.mjs';
import {compactPlan} from './pr356-plan.mjs';
import {officialCandidate} from './pr356-scope.mjs';
import {aggregateSpec,runAggregation,readPr356AdmissionPin} from './pr356-admission.mjs';
function controlled(path,temp){
 assert(typeof temp==='string'&&temp,'Controlled RUNNER_TEMP missing');assert(typeof path==='string'&&path,'Controlled gate path missing');
 const root=realpathSync(temp),p=resolve(path),part=relative(root,p);assert(part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../'),'Gate path must be below RUNNER_TEMP');
 mkdirSync(dirname(p),{recursive:true});assert.equal(realpathSync(dirname(p)),dirname(p),'Gate path cannot follow symlinks');return p;
}
export async function runPr356StableGate({needs,env=process.env,recompute=officialCandidate,aggregate=runAggregation,fetcher=fetch}={}){
 if(env.GITHUB_EVENT_NAME==='pull_request')return runPr356PullRequestGate({needs,env,recompute,aggregate,fetcher});
 let declared;try{declared=JSON.parse(needs.scope.outputs.pr356_plan)}catch{}
 const {plan:source,admissionPin}=validatePr356GateNeeds(needs,declared?.context?.actualDraft,env);
 const full=await recompute(env),current=compactPlan(full);
 for(const key of ['schemaVersion','route','phase','repository','pr','branch','base','head','checkout','tree','product','components','inventorySHA256','bindingSHA256','acceptanceSHA256','candidateInputsSHA256','requiredPhaseIds','phases','historicalEvidence'])assert.deepEqual(current[key],source[key],'Officially recomputed source differs: '+key);
 assert.equal(current.context.actualDraft,false);assert.equal(current.context.mainSha,source.base);
 const specPath=controlled(env.PR356_PHASE_SPEC,env.RUNNER_TEMP),inputPath=controlled(env.PR356_PHASE_INPUTS,env.RUNNER_TEMP),out=controlled(env.PR356_EVIDENCE_DIR,env.RUNNER_TEMP);
 assert.notEqual(specPath,inputPath);assert(!existsSync(specPath)&&!existsSync(inputPath),'Preserve previous gate recipe');
 const spec=aggregateSpec(full,'merge-admission');writeFileSync(specPath,JSON.stringify(spec,null,2)+'\n',{flag:'wx',mode:0o600});writeFileSync(inputPath,JSON.stringify(spec.inputs,null,2)+'\n',{flag:'wx',mode:0o600});
 // This core authenticates the exact successful precheck, qualification,
 // all selected phase/input/case evidence and current official source.
 const result=await aggregate({mode:'gate',plan:full,admissionPin,out,env});
 return {head:full.head,base:full.base,tree:full.tree,candidateInputsSHA256:full.candidateInputsSHA256,role:'merge-admission',result,externalDotApprovalRequired:true,releaseAuthorized:false};
}

export async function runPr356PullRequestGate({needs,env=process.env,recompute=officialCandidate,aggregate=runAggregation,fetcher=fetch}={}){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_EVENT_NAME,'pull_request');assert.equal(env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 assert.equal(env.GITHUB_REF,'refs/pull/356/merge');assert.equal(needs?.scope?.result,'success');
 assert.equal(needs.scope.outputs.application_route,'pr356');assert.equal(needs.scope.outputs.pr356_phase,'observe');
 const declared=JSON.parse(needs.scope.outputs.pr356_plan),full=await recompute(env),current=compactPlan(full);
 for(const key of ['schemaVersion','route','phase','repository','pr','branch','base','head','checkout','tree','product','components','inventorySHA256','bindingSHA256','acceptanceSHA256','candidateInputsSHA256','requiredPhaseIds','phases','historicalEvidence'])assert.deepEqual(current[key],declared[key],'Official PR source differs: '+key);
 assert.equal(current.phase,'observe');assert.equal(current.context.event,'pull_request');assert.equal(current.context.actualDraft,false);assert.equal(current.context.mainSha,current.base);
 assert.equal(current.checkout,env.GITHUB_SHA);assert.equal(current.checkout,current.context.mergeCommitSha);
 assert.equal(String(current.context.runId),env.GITHUB_RUN_ID);assert.equal(String(declared.context.runId),env.GITHUB_RUN_ID);
 assert(BigInt(declared.context.attempt)<=BigInt(env.GITHUB_RUN_ATTEMPT));
 assert(env.GH_TOKEN,'Official read token missing');
 const response=await fetcher('https://api.github.com/repos/caohuibj/eduK12-new-version/pulls/356',{headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'},redirect:'error'});
 assert.equal(response.status,200,'Official PR admission locator unavailable');const pr=await response.json();
 assert.equal(pr.number,356);assert.equal(pr.state,'open');assert.equal(pr.merged,false);assert.equal(pr.draft,false);assert.equal(pr.head.sha,current.head);assert.equal(pr.head.repo.full_name,current.repository);assert.equal(pr.base.sha,current.base);
 const admissionPin=readPr356AdmissionPin(pr.body,current.head);
 const specPath=controlled(env.PR356_PHASE_SPEC,env.RUNNER_TEMP),inputPath=controlled(env.PR356_PHASE_INPUTS,env.RUNNER_TEMP),out=controlled(env.PR356_EVIDENCE_DIR,env.RUNNER_TEMP);
 assert.notEqual(specPath,inputPath);assert(!existsSync(specPath)&&!existsSync(inputPath),'Preserve previous PR gate recipe');
 const spec=aggregateSpec(full,'merge-admission');writeFileSync(specPath,JSON.stringify(spec,null,2)+'\n',{flag:'wx',mode:0o600});writeFileSync(inputPath,JSON.stringify(spec.inputs,null,2)+'\n',{flag:'wx',mode:0o600});
 const result=await aggregate({mode:'pr-gate',plan:full,admissionPin,out,env,fetcher});
 return {head:full.head,base:full.base,tree:full.tree,checkout:full.checkout,role:'pull-request-admission',result,externalDotApprovalRequired:true,releaseAuthorized:false};
}
