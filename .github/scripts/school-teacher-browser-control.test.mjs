import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allowed,branch,shots,verifyReport,assertCleanTree} from './school-teacher-browser-control.mjs';
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
 assert.deepEqual(selected[0].jobs,['frontend','backend','browser']);
 assert(!Object.hasOwn(selected[0].on,'workflow_call'));
});
test('one frontend producer, one explicit backend emit and same-run artifacts',()=>{
 assert.equal((flow.match(/uses: \.\/\.github\/workflows\/ci-frontend-build.yml/g)||[]).length,1);
 assert.equal((flow.match(/typescript\/bin\/tsc -p tsconfig.json/g)||[]).length,1);
 assert(!/run:.*npm run build/.test(flow));assert(!flow.includes('cognitive-ci-diagnostics'));
 for(const kind of ['frontend','backend'])assert(flow.includes(`ci-artifact.mjs verify ${kind}`));
 assert(flow.includes('needs: [frontend, backend]'));assert(flow.includes('performance_smoke: false'));assert(flow.includes('ui_lab: false'));
});
test('isolated services and public-only evidence, with no deployment or secrets inheritance',()=>{
 assert(flow.includes('postgres:16.15-bookworm'));assert(flow.includes('school_teacher_browser_ci_test'));
 assert(!/secrets: inherit|secrets\.|environment:|id-token: write|contents: write|ignoreHTTPSErrors|NODE_TLS_REJECT_UNAUTHORIZED/.test(flow));
 assert.equal((flow.match(/path: school-teacher-evidence/g)||[]).length,1);
 assert(flow.includes('if: always()'));assert(flow.includes('school-teacher-browser-control.mjs cleanup'));
});

function sample(){
 const head='a'.repeat(40),tree='b'.repeat(40),runId='123';
 const manifests=Object.fromEntries(['frontend','backend'].map(kind=>[kind,{schemaVersion:1,sha:head,runId,kind,contentDigest:'c'.repeat(64),lockDigest:'d'.repeat(64)}]));
 const report={schemaVersion:1,status:'PASSED',errors:[],source:{head,tree},inputs:manifests,coverage:[],screenshots:[],keyboard:[],sessions:[],notCovered:['Real media storage','Public TLS']};
 for(const product of ['SCHOOL','TEACHER']){
  for(const check of ['author-SCALE','author-FORM','fixed-version-preview-publish',`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-SCALE`,`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-FORM`])report.coverage.push({product,check});
  for(const width of [1440,390])for(const name of shots)report.screenshots.push({file:`screenshots/${product.toLowerCase()}-${name}-${width}.png`,viewport:{width,height:width===1440?900:844},layout:{width,scrollWidth:width,secretNodes:0},keyboard:{focusVisible:true,visible:true,ring:true},accessibility:{violations:[],passes:1,incomplete:[]}});
  for(const control of ['radio','radio','checkbox','scale-option-button'])report.keyboard.push({product,control,action:'Space',selected:true,focusVisible:true});
  for(const actor of product==='SCHOOL'?['author','participant']:['author','participant','ordinary-psychology-author'])report.sessions.push({product,actor,pageErrors:[],unexpectedRequests:[],requestFailures:[],failedResponses:[],expectedFailures:[],consoleErrors:[]});
 }
 report.coverage.push({product:'TEACHER',check:'ordinary-psychology-author-real-API'});
 return {report,identity:{head,tree,runId,...manifests}};
}
const png=()=>Buffer.from('89504e470d0a1a0a00','hex');
test('complete current-run report is diagnostic only',()=>{const s=sample();assert.equal(verifyReport(s.report,s.identity,png).mergeQualification,false);});
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
