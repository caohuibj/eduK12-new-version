import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const binding=JSON.parse(readFileSync(new URL('./pr356-bindings.json',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export function verifyCandidate(entries,base,head,read=git){
 assert.equal(base,binding.base,'PR356 main base drift');assert.equal(binding.base,'ff8471e529e7b3c56e1e20f17d1e2581040fc896');
 assert.equal(binding.product,'48516ef5900cf9f711ea3cc852ac148cd221d7f8');assert.match(head,/^[a-f0-9]{40}$/);
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
export function refuseUnplannedPR356(env=process.env){
 const ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(ref===binding.branch)throw new Error('PR356 uses its explicitly authorized bounded qualification dispatch; no legacy/full/probe fallback or merge eligibility');
}
export async function officialCandidate(env=process.env,fetcher=fetch){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,binding.repository);
 assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/'+binding.branch);
 assert.equal(env.PR356_STEP_PROBE,'none');assert.notEqual(env.PR356_FULL_ACCEPTANCE,'true');assert.notEqual(env.PR356_COMPLETE_TRAINING,'true');
 assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);
 const api=async path=>{const r=await fetcher('https://api.github.com/repos/'+binding.repository+'/'+path,{headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'}});assert.equal(r.status,200,'PR356 official candidate metadata unavailable');return r.json();};
 const [pr,main]=await Promise.all([api('pulls/356'),api('git/ref/heads/main')]);
 assert.equal(pr.state,'open');assert.equal(pr.merged,false);assert.equal(pr.head.ref,binding.branch);assert.equal(pr.head.repo.full_name,binding.repository);
 assert.equal(pr.head.sha,env.GITHUB_SHA,'A newer PR head exists; do not qualify stale source');assert.equal(pr.base.sha,binding.base);assert.equal(main.object.sha,binding.base);
 assert.match(pr.merge_commit_sha||'',/^[a-f0-9]{40}$/);const merge=await api('git/commits/'+pr.merge_commit_sha);
 assert.deepEqual(merge.parents.map(p=>p.sha).sort(),[binding.base,env.GITHUB_SHA].sort(),'PR merge preview parent drift');assert.equal(merge.tree.sha,git('rev-parse','HEAD^{tree}'),'PR merge tree drift');
 const {changedEntries}=await import('./content-scope.mjs');
 const plan=verifyCandidate(changedEntries(binding.base,env.GITHUB_SHA),binding.base,env.GITHUB_SHA);
 return {...plan,pr:356,actualDraft:pr.draft,mergePreview:pr.merge_commit_sha,mergeTree:merge.tree.sha,parents:merge.parents.map(p=>p.sha),run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,authorization:'User explicitly requested closure, submission and CI activation in this conversation. No merge/deployment authorization.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await officialCandidate(),null,2));
