import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prior,expectedManifest,verifyOfficial,verifyChangedPaths,verifyReceipt,ZIP_CHECK,verifyInputClosure} from './school-teacher-browser-reuse.mjs';
import {allowed,branch,shots,verifyReport,assertCleanTree,safeReuseFailure} from './school-teacher-browser-control.mjs';
const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_REF:'refs/heads/'+branch};
const event={deleted:false};
const flow=readFileSync(new URL('../workflows/ci-school-teacher-browser.yml',import.meta.url),'utf8');
test('exact standalone push rejects work/local/main/fork/manual/delete and missing event identity',()=>{
 assert(allowed(env,event));
 for(const change of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REPOSITORY:'other/repo'},...['main','work/school-teacher-review-20261022','work/school-teacher-main-integration-20261022'].map(b=>({GITHUB_REF:'refs/heads/'+b}))])assert(!allowed({...env,...change},event));
 assert(!allowed(env,{deleted:true}));assert(!allowed(env,{}));
});
test('all actual workflows select only this standalone graph for the acceptance push',()=>{
 const directory=fileURLToPath(new URL('../workflows',import.meta.url));
 const code=`import yaml,json,pathlib,sys
out=[]
for p in pathlib.Path(sys.argv[1]).iterdir():
 if p.suffix not in ['.yml','.yaml']: continue
 d=yaml.safe_load(p.read_text()); on=d.get('on',d.get(True)); out.append({'file':p.name,'on':on,'jobs':list(d.get('jobs',{}))})
print(json.dumps(out))`;
 const all=JSON.parse(execFileSync('python',['-c',code,directory],{encoding:'utf8'}));
 assert(all.length>=58);
 const selected=[];
 for(const w of all){
  const on=w.on;if(!on||typeof on!=='object'||Array.isArray(on)){assert(![on,...(Array.isArray(on)?on:[])].includes('push'));continue;}
  if(!Object.hasOwn(on,'push'))continue;
  const push=on.push;assert(push&&Array.isArray(push.branches),`${w.file}: unbounded push forbidden`);
  assert(push.branches.every(b=>!['*','?','['].some(c=>b.includes(c))),`${w.file}: review new wildcard before qualification`);
  if(push.branches.includes(branch))selected.push(w);
 }
 assert.deepEqual(selected.map(w=>w.file),['ci-school-teacher-browser.yml']);
 assert.deepEqual(selected[0].jobs,['browser']);
 assert(!Object.hasOwn(selected[0].on,'workflow_call'));
});
test('fixed official build reuse runs only consumer and never recompiles',()=>{
 assert(!flow.includes('ci-frontend-build.yml'));assert(!flow.includes('typescript/bin/tsc'));assert(!flow.includes('npm run build'));assert(!flow.includes('needs:'));
 assert(flow.includes('school-teacher-browser-control.mjs restore'));assert(flow.includes('fetch-depth: 0'));assert(flow.includes('GH_TOKEN: ${{ github.token }}'));
 assert(!flow.includes('ci-artifact.mjs write'));assert(!flow.includes('actions/download-artifact'));
});
test('isolated services and public-only evidence, with no deployment or secrets inheritance',()=>{
 assert(flow.includes('postgres:16.15-bookworm'));assert(flow.includes('school_teacher_browser_ci_test'));
 assert(!/secrets: inherit|secrets\.|environment:|id-token: write|contents: write|ignoreHTTPSErrors|NODE_TLS_REJECT_UNAUTHORIZED/.test(flow));
 assert.equal((flow.match(/path: school-teacher-evidence/g)||[]).length,1);
 assert(flow.includes('if: always()'));assert(flow.includes('school-teacher-browser-control.mjs cleanup'));
});

function sample(){
 const head='a'.repeat(40),tree='b'.repeat(40),runId='123';
 const manifests=Object.fromEntries(['frontend','backend'].map(kind=>[kind,expectedManifest(kind)]));
 const reuse={status:'VERIFIED_OFFICIAL_BUILDS',currentHead:head,currentRun:runId,sourceHead:prior.head,sourceRun:String(prior.run),originalRunConclusion:'failure',components:structuredClone(manifests)};
 const startups=[{product:'SCHOOL',corsOrigin:'https://school.eduk12.top',ready:true,phase:'READY'},{product:'TEACHER',corsOrigin:'https://teacher.eduk12.top',ready:true,phase:'READY'}];
 const report={startups,buildReuse:structuredClone(reuse),schemaVersion:1,status:'PASSED',errors:[],source:{head,tree},inputs:manifests,coverage:[],screenshots:[],keyboard:[],sessions:[],notCovered:['Real media storage','Public TLS']};
 for(const product of ['SCHOOL','TEACHER']){
  for(const check of ['author-SCALE','author-FORM','fixed-version-preview-publish',`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-SCALE`,`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-FORM`])report.coverage.push({product,check});
  for(const width of [1440,390])for(const name of shots)report.screenshots.push({file:`screenshots/${product.toLowerCase()}-${name}-${width}.png`,viewport:{width,height:width===1440?900:844},layout:{width,scrollWidth:width,secretNodes:0},keyboard:{focusVisible:true,visible:true,ring:true},accessibility:{violations:[],passes:1,incomplete:[]}});
  for(const control of ['radio','radio','checkbox','scale-option-button'])report.keyboard.push({product,control,action:'Space',selected:true,focusVisible:true});
  for(const actor of product==='SCHOOL'?['author','participant']:['author','participant','ordinary-psychology-author'])report.sessions.push({product,actor,pageErrors:[],unexpectedRequests:[],requestFailures:[],failedResponses:[],expectedFailures:[],consoleErrors:[]});
 }
 report.coverage.push({product:'TEACHER',check:'ordinary-psychology-author-real-API'});
 return {report,identity:{head,tree,runId,...manifests,reuse}};
}
const png=()=>Buffer.from('89504e470d0a1a0a00','hex');
test('current browser and original builds remain separate diagnostic identities',()=>{const s=sample();assert.equal(verifyReport(s.report,s.identity,png).mergeQualification,false);});
test('missing, failed or different-run checks never become accepted',()=>{
 for(const mutate of [r=>r.coverage.pop(),r=>r.screenshots.pop(),r=>r.screenshots[0].accessibility.violations.push({id:'contrast'}),r=>r.screenshots[0].keyboard.focusVisible=false,r=>r.keyboard.pop(),r=>r.sessions[0].failedResponses.push({path:'/unexpected',status:500}),r=>r.sessions[0].consoleErrors.push({network:false}),r=>r.inputs.frontend.runId='999',r=>r.source.tree='0'.repeat(40),r=>r.status='FAILED']){
  const s=sample();s.report=structuredClone(s.report);mutate(s.report);assert.throws(()=>verifyReport(s.report,s.identity,png));
 }
});

test('backend cwd clean-tree guard checks repository-root source and controls',()=>{
 const root=mkdtempSync('/tmp/school-teacher-control-cwd-');
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try{
  mkdirSync(root+'/server-version/backend',{recursive:true});mkdirSync(root+'/.github');
  for(const file of ['server-version/backend/source.ts','.github/control.mjs'])writeFileSync(root+'/'+file,'original');
  git('init','-q');git('add','.');git('-c','user.name=Synthetic Control Test','-c','user.email=control@example.invalid','commit','-qm','synthetic fixture');
  const cwd=root+'/server-version/backend';assertCleanTree(cwd);
  for(const file of ['server-version/backend/source.ts','.github/control.mjs']){
   writeFileSync(root+'/'+file,'changed');assert.throws(()=>assertCleanTree(cwd));writeFileSync(root+'/'+file,'original');assertCleanTree(cwd);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

// GitHub's context availability table, not just YAML syntax:
// https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
function contextErrors(workflow){
 const errors=[];
 const base=['github','needs','strategy','matrix','vars','secrets','inputs'];
 function visit(value,path){
  if(value&&typeof value==='object'){for(const [key,v] of Object.entries(value))visit(v,[...path,key]);return;}
  if(typeof value!=='string')return;
  const expressions=[...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)];if(!expressions.length)return;
  let allowed;
  if(path[0]==='env')allowed=['github','secrets','inputs','vars'];
  else if(path[0]==='jobs'&&path[2]==='env')allowed=base;
  else if(path[0]==='jobs'&&path[2]==='if')allowed=['github','needs','vars','inputs'];
  else if(path[0]==='jobs'&&path[2]==='with')allowed=['github','needs','strategy','matrix','inputs','vars'];
  else if(path[0]==='jobs'&&path[2]==='steps')allowed=[...base,'job','runner','env','steps'];
  else {errors.push('Unreviewed expression location '+path.join('.'));return;}
  for(const [,expression] of expressions){
   const unquoted=expression.replace(/'(?:[^']|'')*'/g,'');
   for(const [,root] of unquoted.matchAll(/(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\s*(?=\.|\[)/g))if(!allowed.includes(root))errors.push(path.join('.')+':'+root);
  }
 }
 visit(workflow,[]);return errors;
}
test('GitHub expression contexts reject job-level runtime values and allow step binding',()=>{
 const doc=JSON.parse(execFileSync('python',['-c','import yaml,json,sys;print(json.dumps(yaml.safe_load(sys.stdin.read())))'],{input:flow,encoding:'utf8'}));
 assert.deepEqual(contextErrors(doc),[]);
 for(const value of ['${{ runner.temp }}','${{ job.services.postgres.ports[5432] }}']){
  const bad=structuredClone(doc);bad.jobs.browser.env.TEST=value;assert(contextErrors(bad).length>0);
 }
 const binding=doc.jobs.browser.steps.find(s=>s.name==='bind isolated service endpoints after runner initialization');
 assert.equal(Object.keys(binding.env).length,5);
 for(const key of Object.keys(binding.env))assert(binding.run.includes(`"$${key}" >> "$GITHUB_ENV"`));
 assert(!binding.run.includes('echo'));assert(!binding.run.includes('set -x'));
});

function officialFixture(kind='frontend'){
 const p=prior.components[kind];return {run:{id:prior.run,run_attempt:1,head_sha:prior.head,head_branch:prior.branch,event:'push',path:'.github/workflows/ci-school-teacher-browser.yml',repository:{full_name:prior.repository},head_repository:{full_name:prior.repository},status:'completed',conclusion:'failure'},job:{id:p.job,run_id:prior.run,run_attempt:1,head_sha:prior.head,name:p.name,status:'completed',conclusion:'success',steps:[{name:p.step,conclusion:'success'}]},artifact:{id:p.artifact,name:`${kind}-dist-${prior.head}`,expired:false,size_in_bytes:p.bytes,digest:'sha256:'+p.zip,workflow_run:{id:prior.run,head_sha:prior.head}}};
}
test('official reuse rejects changed source, job, run, artifact and incomplete or overwritten failure',()=>{
 for(const kind of ['frontend','backend']){const f=officialFixture(kind);verifyOfficial(f.run,f.job,f.artifact,kind);}
 for(const mutate of [f=>f.run.conclusion='success',f=>f.run.status='in_progress',f=>f.run.head_sha='f'.repeat(40),f=>f.run.repository.full_name='other/repo',f=>f.run.run_attempt=2,f=>f.run.event='pull_request',f=>f.job.conclusion='failure',f=>f.job.id++,f=>f.job.head_sha='0'.repeat(40),f=>f.job.steps=[],f=>f.artifact.expired=true,f=>f.artifact.id++,f=>f.artifact.size_in_bytes++,f=>f.artifact.digest='sha256:'+'0'.repeat(64),f=>f.artifact.workflow_run.id++]){const f=officialFixture();mutate(f);assert.throws(()=>verifyOfficial(f.run,f.job,f.artifact,'frontend'));}
});
test('reuse closure is failclosed for all component, dependency, config and unknown paths',()=>{
 verifyChangedPaths(['server-version/e2e/school-teacher-browser.cjs','.github/scripts/school-teacher-browser-reuse.mjs']);
 for(const p of ['server-version/backend/src/index.ts','server-version/frontend/package-lock.json','server-version/scripts/ci-install-canvas-deps.sh','.github/workflows/ci-frontend-build.yml','.github/scripts/ci-artifact.mjs','.github/release-tools/package-lock.json','new-unknown.ts'])assert.throws(()=>verifyChangedPaths([p]));
 assert.throws(()=>verifyChangedPaths([]));
});
test('receipt cannot rebrand old builds or accept arbitrary source metadata',()=>{
 const s=sample();verifyReceipt(s.identity.reuse,s.identity.head,s.identity.runId);
 for(const mutate of [r=>r.currentHead=prior.head,r=>r.currentRun='0',r=>r.sourceRun='0',r=>r.sourceHead='0'.repeat(40),r=>r.components.backend.contentDigest='0'.repeat(64),r=>r.components.frontend.sha=s.identity.head,r=>r.originalRunConclusion='success']){const r=structuredClone(s.identity.reuse);mutate(r);assert.throws(()=>verifyReceipt(r,s.identity.head,s.identity.runId));}
});

test('official archive extraction rejects traversal, absolute paths, symlinks and duplicate members',()=>{
 const root=mkdtempSync('/tmp/school-teacher-zip-control-');
 try{
  for(const mode of ['valid','traversal','absolute','symlink','duplicate']){
   const archive=root+'/'+mode+'.zip';
   execFileSync('python3',['-c',`import sys,zipfile,stat
p,m=sys.argv[1:]; z=zipfile.ZipFile(p,'w');z.writestr('ci-build-manifest.json','{}')
if m=='valid':z.writestr('index.js','ok')
if m=='traversal':z.writestr('../escape','bad')
if m=='absolute':z.writestr('/escape','bad')
if m=='duplicate':z.writestr('ci-build-manifest.json','{}')
if m=='symlink':
 i=zipfile.ZipInfo('link');i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,'../escape')
z.close()`,archive,mode],{stdio:'pipe'});
   const execute=()=>execFileSync('python3',['-c',ZIP_CHECK,archive,root+'/'+mode],{stdio:'pipe'});
   if(mode==='valid')execute();else assert.throws(execute);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('actual Git closure requires old commit ancestor and unchanged component trees',()=>{
 const root=mkdtempSync('/tmp/school-teacher-reuse-git-');const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const commit=()=>{git('add','.');git('-c','user.name=Synthetic Control','-c','user.email=control@example.invalid','commit','-qm','synthetic');};
 try{
  for(const component of ['frontend','backend']){mkdirSync(root+'/server-version/'+component,{recursive:true});writeFileSync(root+'/server-version/'+component+'/source.ts','original');}
  mkdirSync(root+'/.github/scripts',{recursive:true});git('init','-q');commit();const old=git('rev-parse','HEAD');
  writeFileSync(root+'/.github/scripts/school-teacher-browser-reuse.mjs','synthetic control');commit();verifyInputClosure(old,root);
  assert.throws(()=>verifyInputClosure('f'.repeat(40),root));
  writeFileSync(root+'/server-version/backend/source.ts','changed');commit();assert.throws(()=>verifyInputClosure(old,root));
  const future=git('rev-parse','HEAD');git('checkout','--detach',old);assert.throws(()=>verifyInputClosure(future,root));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('actual restore CLI exits on invalid CI identity without dynamic-import deadlock or network',()=>{
 const control=fileURLToPath(new URL('./school-teacher-browser-control.mjs',import.meta.url));
 let failure;try{execFileSync(process.execPath,[control,'restore'],{env:{PATH:process.env.PATH,CI:'false'},timeout:3000,stdio:'pipe'});}catch(error){failure=error;}
 assert(failure);assert.equal(failure.status,1);assert.equal(failure.signal,null);assert.match(failure.stderr.toString(),/AssertionError/);assert.match(failure.stderr.toString(),/false/);assert(!failure.stderr.toString().includes('unsettled top-level await'));
 assert(flow.includes('run: node .github/scripts/school-teacher-browser-control.mjs restore'));
 const reuse=readFileSync(new URL('./school-teacher-browser-reuse.mjs',import.meta.url),'utf8');assert(!reuse.includes("import('./school-teacher-browser-control.mjs')"));
});

test('both real product startups are required and restore diagnostics cannot expose URLs',()=>{
 const s=sample();verifyReport(s.report,s.identity,png);
 for(const mutate of [r=>r.startups.pop(),r=>r.startups[0].corsOrigin='https://wrong.invalid',r=>r.startups[1].ready=false,r=>r.startups[0].phase='STARTING']){const r=structuredClone(s.report);mutate(r);assert.throws(()=>verifyReport(r,s.identity,png));}
 const diagnostic=safeReuseFailure(new Error('https://example.invalid/?sig=secret-marker'));
 assert.match(diagnostic,/Diagnostic SHA256 [0-9a-f]{64}$/);assert(!diagnostic.includes('secret-marker'));assert(!diagnostic.includes('https:'));
});
