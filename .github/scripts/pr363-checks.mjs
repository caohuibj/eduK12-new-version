import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,rmSync,openSync,closeSync,readSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pr363Plan,requirePr363Jobs,safePath} from './pr363-scope.mjs';
import {changedEntries} from './content-scope.mjs';
import {treeDigest,verifyManifest} from './ci-artifact.mjs';
const out='pr363-evidence',sha=v=>createHash('sha256').update(v).digest('hex');
function fileSHA(path){const fd=openSync(path,'r'),h=createHash('sha256'),chunk=Buffer.alloc(1024*1024);try{let n;while((n=readSync(fd,chunk,0,chunk.length,null)))h.update(chunk.subarray(0,n));}finally{closeSync(fd);}return h.digest('hex');}
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');}
function run(id,exe,args,cwd=process.cwd()){
 mkdirSync(out,{recursive:true});const log=resolve(out,id+'.log'),fd=openSync(log,'w');const start=new Date().toISOString();
 const {GH_TOKEN,GITHUB_TOKEN,...env}=process.env;let r;try{r=spawnSync(exe,args,{cwd,env,stdio:['ignore',fd,fd]});}finally{closeSync(fd);}
 save('command-'+id,{argv:[exe,...args],exitCode:r.status,signal:r.signal,startedAt:start,completedAt:new Date().toISOString(),logSHA256:sha(readFileSync(log))});
 assert.equal(r.status,0,id+' failed; original log/receipt retained');return r;
}
export function verifyConsumerReport(report,step,identity){
 assert(step.expectedCases.length);let names;
 if(step.kind==='vitest'){
  assert.equal(report.success,true);assert.equal(report.numFailedTests,0);
  const cases=report.testResults.flatMap(s=>s.assertionResults);names=cases.filter(c=>c.status==='passed').map(c=>c.fullName);
  const filtered=cases.filter(c=>['pending','skipped'].includes(c.status)).map(c=>c.fullName).sort();
  assert.deepEqual(filtered,[...(step.expectedFiltered??[])].sort());assert.equal(cases.length,names.length+filtered.length);
 }else{
  assert.equal(step.kind,'browser');assert.equal(report.status,'PASSED');assert.deepEqual(report.errors,[]);
  assert.equal(report.source.head,identity.head);assert.equal(report.source.tree,identity.tree);assert.equal(String(report.runId),String(identity.runId));
  for(const c of ['frontend','backend'])assert.deepEqual(report.inputs[c],identity.manifests[c]);
  names=report.coverage.map(c=>c.product+':'+c.check);
 }
 assert(names.length&&new Set(names).size===names.length);assert.deepEqual(names.sort(),[...step.expectedCases].sort(),'Missing/extra selected outcomes');
 return {passed:names.length,caseNames:names};
}
function checkPlan(){
 assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.version,'v24.21.0');
 const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);
 const p=JSON.parse(process.env.PLAN);assert.equal(p.head,head);assert.deepEqual(pr363Plan(changedEntries(p.base,head),p.base,head),p);assert.equal(p.draft,false);
 return p;
}
function manifest(component){const dir=`server-version/${component}/dist`,m=JSON.parse(readFileSync(dir+'/ci-build-manifest.json'));
 verifyManifest(m,{schemaVersion:1,sha:git('rev-parse','HEAD'),runId:process.env.GITHUB_RUN_ID,kind:component,lockDigest:sha(readFileSync(`server-version/${component}/package-lock.json`))},treeDigest(dir));return m;}
export function assertFirstBuildAttempt(env=process.env){assert.equal(String(env.GITHUB_RUN_ATTEMPT),'1','Producer retries require root review of original partial build/upload; never automatically rebuild');}
function build(component,p){
 assert(['backend','frontend'].includes(component));assertFirstBuildAttempt();
 const context=`server-version/${component}`,build=`pr363-${component}-build`,runtime=`pr363-${component}-runtime`;
 const args=['--build-arg','NPM_REGISTRY=https://registry.npmjs.org'];if(component==='backend')args.push('--build-arg','DEBIAN_MIRROR=');
 if(component==='frontend')for(const flag of p.execution.frontend.buildArgs)args.push('--build-arg',flag);
 run(component+'-build','docker',['build',...args,'--target','build','-t',build,context]);
 // Exactly the same context/arguments share the already-built production stage.
 run(component+'-runtime','docker',['build',...args,'--target','runtime','-t',runtime,context]);
 const container=execFileSync('docker',['create',build],{encoding:'utf8'}).trim();
 try{rmSync(context+'/dist',{recursive:true,force:true});run(component+'-extract','docker',['cp',container+':/app/dist',context+'/dist']);}finally{execFileSync('docker',['rm',container]);}
 run(component+'-manifest','node',['.github/scripts/ci-artifact.mjs','write',component]);
 const images={};for(const[tag,file]of [[build,'builder.tar'],[runtime,'runtime.tar']]){
  run(component+'-'+file.replace('.tar','')+'-save','docker',['save','-o',`${out}/${component}-${file}`,tag]);
  const data=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0];images[file]={imageId:data.Id,tag,sha256:fileSHA(`${out}/${component}-${file}`)};
 }
 save(component+'-images',{head:p.head,runId:process.env.GITHUB_RUN_ID,images,manifest:manifest(component)});
}
export function verifyImageReceipt(r,{component,head,runId},read){
 assert.equal(r.head,head);assert.equal(String(r.runId),String(runId));
 for(const[file,v]of Object.entries(r.images)){assert(['builder.tar','runtime.tar'].includes(file));assert.equal(v.tag,`pr363-${component}-${file==='builder.tar'?'build':'runtime'}`);assert.match(v.imageId,/^sha256:[a-f0-9]{64}$/);const bytes=read(`${component}-${file}`);assert.equal(typeof bytes==='string'?bytes:sha(bytes),v.sha256);}
 assert.deepEqual(Object.keys(r.images).sort(),['builder.tar','runtime.tar']);return r.images;
}
function loadImages(component,p){const r=JSON.parse(readFileSync(`${out}/${component}-images.json`));const images=verifyImageReceipt(r,{component,head:p.head,runId:process.env.GITHUB_RUN_ID},f=>fileSHA(`${out}/${f}`));
 for(const[file,v]of Object.entries(images)){run(component+'-load-'+file.replace('.tar',''),'docker',['load','-i',`${out}/${component}-${file}`]);assert.equal(execFileSync('docker',['image','inspect',v.tag,'--format','{{.Id}}'],{encoding:'utf8'}).trim(),v.imageId);}return r;}
function consumers(phase,p){
 const manifests=phase==='browser'?Object.fromEntries(['frontend','backend'].map(c=>[c,manifest(c)])):null;
 for(const step of p.execution[phase].steps){safePath(step.report);rmSync(step.report,{force:true});run(phase+'-'+step.id,step.argv[0],step.argv.slice(1));const report=JSON.parse(readFileSync(step.report));save(phase+'-'+step.id+'-verified',verifyConsumerReport(report,step,{head:p.head,tree:p.tree,runId:process.env.GITHUB_RUN_ID,manifests}));}
}
async function main(){const phase=process.argv[2],p=checkPlan();mkdirSync(out,{recursive:true});
 if(phase==='source'){save('source',{head:p.head,tree:p.tree,sourceHead:p.sourceHead,runId:process.env.GITHUB_RUN_ID,status:'SOURCE_VERIFIED',applicationQualification:false});return;}
 if(phase==='aggregate'){requirePr363Jobs(JSON.parse(process.env.NEEDS_JSON));return;}
 if(phase.startsWith('build-')){build(phase.slice(6),p);return;}
 if(phase==='audit'){const results=[];for(const c of ['backend','frontend']){try{const args=['run','--rm',`pr363-${c}-build`,'npm','audit','--audit-level=high'];loadImages(c,p);run(c+'-audit','docker',args);results.push({component:c,status:'passed'});}catch{results.push({component:c,status:'failed'});}}save('audit-outcomes',{results});assert(results.every(r=>r.status==='passed'),'Dependency audit failed');return;}
 if(phase.startsWith('scan-')){const c=phase.slice(5),r=loadImages(c,p);run(c+'-scan','trivy',['image','--exit-code','1','--ignore-unfixed','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--output',`${out}/${c}-scan.json`,r.images['runtime.tar'].imageId]);return;}
 assert(['backend','frontend','pg','browser'].includes(phase),'Unknown phase');
 if(phase==='browser'||phase==='pg'||phase==='backend')loadImages('backend',p);if(phase==='frontend')loadImages('frontend',p);
 consumers(phase,p);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
