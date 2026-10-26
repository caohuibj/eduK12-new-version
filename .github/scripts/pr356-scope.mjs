import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createPr356Plan,createContextFromGitHub,pr356Outputs,compactPlan} from './pr356-plan.mjs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readPr356Diff as changedEntries} from './pr356-entry.mjs';
export {refuseUnplannedPR356} from './pr356-entry.mjs';
export const binding=JSON.parse(readFileSync(new URL('./pr356-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024}).trim();
export function verifyCandidate(entries,base,head,read=git){
 assert.equal(base,binding.base,'PR356 main base drift');assert.equal(binding.base,'ff8471e529e7b3c56e1e20f17d1e2581040fc896');
 assert.equal(binding.product,'dc915aa5822dcbf395c755a8ca37b6c3589e47a5');assert.match(head,/^[a-f0-9]{40}$/);
 const wanted=new Set([...Object.keys(binding.source),...binding.controls]);
 assert.equal(wanted.size,Object.keys(binding.source).length+binding.controls.length,'Controls overlap product source');
 assert.equal(entries.length,wanted.size,'Complete PR356 raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert(wanted.has(e.file),'Unknown PR356 path: '+e.file);const source=binding.source[e.file];
  if(source){for(const key of ['status','oldMode','newMode'])assert.equal(e[key],source[key],'PR356 source mode/status drift: '+e.file);
   if(source.before)assert.equal(read('rev-parse',base+':'+e.file),source.before,'PR356 source base drift');
   assert.equal(read('rev-parse',head+':'+e.file),source.after,'PR356 source blob drift: '+e.file);
  }else{const old=binding.controlBefore[e.file];assert.equal(e.status,old?'M':'A');assert.equal(e.oldMode,old?'100644':'000000');assert.equal(e.newMode,'100644');if(old)assert.equal(read('rev-parse',base+':'+e.file),old);}
 }
 for(const[c,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+c),tree,'PR356 application tree drift');
 for(const[p,blob]of Object.entries(binding.protectedInputs))assert.equal(read('rev-parse',head+':'+p),blob,'PR356 protected input drift');
 return {schemaVersion:1,route:'pr356-qualification',base,head,product:binding.product,components:binding.components,qualificationOnly:true,mergeEligible:false};
}
export async function officialCandidate(env=process.env,fetcher=fetch){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,binding.repository);
 assert(['workflow_dispatch','pull_request','push'].includes(env.GITHUB_EVENT_NAME));
 assert.equal(env.PR356_STEP_PROBE||'none','none');assert.notEqual(env.PR356_FULL_ACCEPTANCE,'true');assert.notEqual(env.PR356_COMPLETE_TRAINING,'true');
 assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);
 const phase=env.GITHUB_EVENT_NAME==='workflow_dispatch'?env.PR356_PHASE:env.GITHUB_EVENT_NAME==='pull_request'?'observe':'postmerge';
 assert(['qualify','admit','observe','postmerge'].includes(phase),'Explicit PR356 qualify/admit phase required');
 assert.equal(typeof env.GH_TOKEN,'string');assert(env.GH_TOKEN.length,'Official read token missing');
 const payload=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
 const r=await fetcher('https://api.github.com/repos/'+binding.repository+'/pulls/356',{headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'}});
 assert.equal(r.status,200,'Official PR identity unavailable');const pr=await r.json();
 assert.equal(pr.number,356);assert.equal(pr.head.ref,binding.branch);assert.equal(pr.head.repo.full_name,binding.repository);
 // Fetch only exact, validated object identities. This supplies shallow source,
 // base and product objects without accepting a floating branch/tag.
 for(const sha of [binding.base,binding.product,pr.head.sha]){
  assert.match(sha,/^[a-f0-9]{40}$/);
  try{git('cat-file','-e',sha+'^{commit}');}catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',sha],{stdio:'inherit'});}
 }
 const context=await createContextFromGitHub({env,eventPayload:payload,phase,fetcher,read:git});
 const entries=changedEntries(binding.base,env.GITHUB_SHA);
 verifyCandidate(entries,binding.base,env.GITHUB_SHA);
 const acceptance=JSON.parse(readFileSync(new URL('./pr356-acceptance.json',import.meta.url),'utf8'));
 return createPr356Plan({binding,acceptance,entries,base:binding.base,head:env.GITHUB_SHA,context,read:git});
}
function outputDirectory(env){
 assert(env.RUNNER_TEMP,'Controlled RUNNER_TEMP required');
 const root=realpathSync(env.RUNNER_TEMP),out=resolve(env.PR356_EVIDENCE_DIR||'');
 const part=relative(root,out);assert(part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('../'),'Evidence directory must be below RUNNER_TEMP');
 mkdirSync(out,{recursive:true});assert.equal(realpathSync(out),out,'Evidence path may not follow symlinks');return out;
}
export function emitPlan(plan,env=process.env,phaseId){
 const out=outputDirectory(env);
 if(phaseId){
  const spec=plan.phases[phaseId];assert(spec,'Unselected phase');assert.equal(plan.phase,'qualify','No phase execution during admission or main reuse');
  assert.equal(env.PR356_EXPECTED_CANDIDATE_INPUTS_SHA256,plan.candidateInputsSHA256,'Source plan drift before consumer');
  writeFileSync(out+'/phase-spec.json',JSON.stringify(spec,null,2)+'\n',{flag:'wx',mode:0o600});
  writeFileSync(out+'/phase-inputs.json',JSON.stringify(spec.inputs,null,2)+'\n',{flag:'wx',mode:0o600});
 }else{
  writeFileSync(out+'/plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
  writeFileSync(out+'/candidate.json',JSON.stringify(compactPlan(plan),null,2)+'\n',{flag:'wx',mode:0o600});
  if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,Object.entries(pr356Outputs(plan)).map(([k,v])=>k+'='+v+'\n').join(''));
 }
 return compactPlan(plan);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert(['--outputs','--phase-spec'].includes(process.argv[2]),'Explicit source or phase-spec command required');
 if(process.argv[2]==='--phase-spec')assert(process.argv[3],'Phase ID required');
 console.log(JSON.stringify(emitPlan(await officialCandidate(),process.env,process.argv[2]==='--phase-spec'?process.argv[3]:undefined),null,2));
}
