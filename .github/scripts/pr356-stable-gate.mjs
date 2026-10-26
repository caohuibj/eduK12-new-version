/** Stable gate adapter only. Source and original official evidence remain the
 * authority; needs success or a local boolean cannot issue merge admission. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {validatePr356GateNeeds} from './pr356-gate-contract.mjs';
import {compactPlan} from './pr356-plan.mjs';
import {officialCandidate} from './pr356-scope.mjs';
import {aggregateSpec,runAggregation} from './pr356-admission.mjs';
function controlled(path,temp){
 assert(typeof temp==='string'&&temp,'Controlled RUNNER_TEMP missing');assert(typeof path==='string'&&path,'Controlled gate path missing');
 const root=realpathSync(temp),p=resolve(path),part=relative(root,p);assert(part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../'),'Gate path must be below RUNNER_TEMP');
 mkdirSync(dirname(p),{recursive:true});assert.equal(realpathSync(dirname(p)),dirname(p),'Gate path cannot follow symlinks');return p;
}
export async function runPr356StableGate({needs,env=process.env,recompute=officialCandidate,aggregate=runAggregation}={}){
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
