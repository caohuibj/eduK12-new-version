import {participantAccessOutputs} from './participant-access-scope.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {verifyDependencyAuditEvidence} from './training-entry-checks.mjs';
import {execFileSync} from 'node:child_process';
export const branch='backup/shared-sjt-native-20261024';
export const marker='.github/scripts/sjt-native-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./sjt-native-bindings.json',import.meta.url)));
const git=(...args)=>{const text=execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});return args[0]==='show'?text:text.trim()};
export function sjtNativePlan(entries,base,head,read=git,env=process.env){
 const selected=entries.some(e=>e.file===marker),ref=env.CI_HEAD_REF||env.GITHUB_HEAD_REF||env.GITHUB_REF_NAME;
 if(!selected){if(ref===branch)throw Error('Training entry marker missing; no platform/manual fallback');return null;}
 assert.ok(['pull_request','push'].includes(env.CI_EVENT),'No manual/full/probe route');
 assert.notEqual(env.CI_FORCE_FULL,'true','No full-platform fallback');assert.notEqual(env.CI_FULL_ACCEPTANCE,'true','No full acceptance');
 assert.equal(base,binding.base,'Frozen main changed');assert.match(head,/^[a-f0-9]{40}$/);
 assert.equal(binding.base,'b9ad2b7f6fea17a599bdfd57445822c80a4f7538');

 if(env.CI_EVENT==='pull_request'){
  assert.equal(ref,branch);assert.equal(env.CI_PR_REPOSITORY||env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
  assert.match(String(env.CI_PR_NUMBER),/^[1-9][0-9]*$/,'Actual PR number required');assert.match(env.CI_SOURCE_HEAD||'',/^[a-f0-9]{40}$/);
  assert.equal(read('rev-parse',env.CI_SOURCE_HEAD+'^{tree}'),read('rev-parse',head+'^{tree}'),'PR source/merge tree differs');
 }else assert.equal(env.GITHUB_REF_NAME||ref,'main','Only exact main post-merge classification');
 const expected=new Set([...Object.keys(binding.source),...binding.controls]);
 assert.equal(expected.size,Object.keys(binding.source).length+binding.controls.length);
 assert.equal(entries.length,expected.size,'Complete raw diff required');assert.equal(new Set(entries.map(e=>e.file)).size,entries.length);
 for(const e of entries){
  assert.ok(expected.has(e.file),'Unknown path: '+e.file);const s=binding.source[e.file];
  if(s){assert.equal(e.status,s.status);assert.equal(e.oldMode,s.oldMode);assert.equal(e.newMode,s.newMode);
   if(s.before)assert.equal(read('rev-parse',base+':'+e.file),s.before,'Product base drift');
   assert.equal(read('rev-parse',head+':'+e.file),s.after,'Product content drift');
  }else{assert.equal(e.newMode,'100644');const before=binding.controlBefore[e.file];assert.equal(e.status,before?'M':'A');assert.equal(e.oldMode,before?'100644':'000000');if(before)assert.equal(read('rev-parse',base+':'+e.file),before);}
 }
 for(const[file,digest]of Object.entries(binding.controlSHA256||{}))assert.equal(createHash('sha256').update(read('show',head+':'+file)).digest('hex'),digest,'Control bytes changed: '+file);
 for(const[component,tree]of Object.entries(binding.components))assert.equal(read('rev-parse',head+':server-version/'+component),tree,'Component tree drift: '+component);
 for(const[file,blob]of Object.entries(binding.publicationInputs))assert.equal(read('rev-parse',head+':'+file),blob,'Publication input drift: '+file);
 return {schema:1,route:'sjt-native',base,head,productTree:binding.productTree,components:binding.components,postMerge:env.CI_EVENT==='push',changes:entries};
}
export function sjtNativeOutputs(plan){
 const output=participantAccessOutputs(plan);
 delete output.participant_access_plan;
 return {...output,application_route:'sjt-native',scenario:'sjt-native',sjt_native_plan:JSON.stringify(plan)};
}

// This is an input-equivalence check, not a new scientific/publication approval.
export function publicationBoundary(base,head,read=git){
 assert.equal(base,binding.base);
 for(const[file,blob]of Object.entries(binding.publicationInputs)){
  assert.equal(read('rev-parse',head+':'+file),blob);
  if(file===binding.publicationDelta?.file){
   const d=binding.publicationDelta;assert.equal(read('rev-parse',base+':'+file),d.before);
   const extract=text=>{const match=text.match(/export class SjtTemplateError[\s\S]*?\n}/);assert(match,'Error class missing');return match[0]};
   assert.equal(extract(read('show',base+':'+file)),extract(read('show',head+':'+file)));
  }else assert.equal(read('rev-parse',base+':'+file),blob,'Publication validator changed: '+file);
 }
 return {unchangedScientificCatalog:true,unchangedValidatorBehavior:true,scope:'fixed SJT template error-class import delta only'};
}

const sha=value=>createHash('sha256').update(value).digest('hex');
const save=(name,value)=>{mkdirSync('sjt-native-evidence',{recursive:true});writeFileSync('sjt-native-evidence/'+name+'.json',JSON.stringify(value,null,2)+'\n')};
async function dependencyAuditProof(component){
 const prior=JSON.parse(readFileSync('.github/scripts/training-entry-bindings.json','utf8'));
 const r=component==='frontend'?prior.officialFrontendAudit:prior.officialBackendAudit;assert(r,'Exact successful dependency audit binding missing');
 assert.equal(process.env.GITHUB_REPOSITORY,'caohuibj/eduK12-new-version');
 const api=async path=>{const response=await fetch('https://api.github.com/repos/caohuibj/eduK12-new-version/'+path,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});assert.equal(response.status,200,'Official dependency audit evidence unavailable');return response;};
 const [run,job,artifact]=await Promise.all([api(`actions/runs/${r.run}`).then(x=>x.json()),api(`actions/jobs/${r.job}`).then(x=>x.json()),api(`actions/artifacts/${r.artifact}`).then(x=>x.json())]);
 assert.equal(run.head_sha,r.sourceHead);assert.equal(run.event,'pull_request');assert.equal(run.path,'.github/workflows/ci.yml');
 assert.equal(job.id,r.job);assert.equal(job.run_id,r.run);assert.equal(job.head_sha,r.sourceHead);assert.equal(job.status,'completed');
 assert.equal(job.name,'training-entry / admission');assert(job.steps.some(s=>s.name==='run current frontend and backend HIGH CRITICAL dependency audits'&&s.conclusion===(r.auditStepConclusion||'failure')));
 assert.equal(run.head_branch,'backup/training-survey-main350-20261024');assert.equal(artifact.id,r.artifact);
 assert.equal(job.conclusion,r.admissionConclusion||'failure','Original admission conclusion must remain unchanged');
 assert.equal(artifact.workflow_run.id,r.run);assert.equal(artifact.workflow_run.head_sha,r.sourceHead);
 assert.equal(artifact.expired,false);assert.equal(artifact.size_in_bytes,r.bytes);assert.equal(artifact.digest,'sha256:'+r.sha256);assert.equal(artifact.name,r.name);
 const zip=Buffer.from(await(await api(`actions/artifacts/${r.artifact}/zip`)).arrayBuffer());assert.equal(zip.length,r.bytes);assert.equal(sha(zip),r.sha256);
 const files=JSON.parse(execFileSync('python3',['-c',"import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert all(i.file_size<2000000 and not i.filename.startswith('/') and '..' not in i.filename.split('/') for i in z.infolist()); assert sum(i.file_size for i in z.infolist())<8000000; print(json.dumps({i.filename:z.read(i).decode() for i in z.infolist() if not i.is_dir()}))"],{input:zip,encoding:'utf8',maxBuffer:10*1024*1024}));
 const read=name=>{const found=Object.entries(files).filter(([p])=>p.split('/').at(-1)===name);assert.equal(found.length,1);return found[0][1];};
 // npm --package-lock-only consumes dependency metadata, not SJT application source.
 // Verify that metadata against the real previously qualified main, then reuse
 // the existing artifact/exit/24h verifier with that real main manifest.
 for(const name of ['package.json','package-lock.json']){const p='server-version/'+component+'/'+name;assert.equal(git('rev-parse','HEAD:'+p),git('rev-parse',binding.base+':'+p));}
 const proof=verifyDependencyAuditEvidence(JSON.parse(read(component+'-audit-command.json')),read(component+'-audit.stdout.log'),git('ls-tree','-r',binding.base,'--','server-version/'+component),component);
 save(component+'-audit-original-proof',{...proof,run:r.run,job:r.job,artifact:r.artifact,artifactSHA256:r.sha256,originalAdmissionConclusion:r.admissionConclusion||'failure',onlyExactAuditSubprocessAccepted:true});
 return proof;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.argv[2],'dependency-audits');
 for(const component of ['backend','frontend']){
  const proof=await dependencyAuditProof(component);
  assert.equal(proof.fresh,true,'Prior audit expired; explicitly refresh the affected audit before activation');
 }
}
