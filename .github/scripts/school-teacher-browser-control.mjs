import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyReceipt,expectedManifest,restoreBuilds} from './school-teacher-browser-reuse.mjs';
export const branch='ci/school-teacher-browser-20261022';
export function allowed(env,event){
 return env.GITHUB_EVENT_NAME==='push' && env.GITHUB_REPOSITORY==='caohuibj/eduK12-new-version' && env.GITHUB_REF==='refs/heads/'+branch && event.deleted===false;
}
export function assertCleanTree(cwd=process.cwd()){
 assert.equal(execFileSync('git',['diff','--name-only','HEAD','--',':(top)server-version',':(top).github'],{cwd,encoding:'utf8'}).trim(),'');
}
export function preflight(env=process.env){
 assert.equal(env.CI,'true');assert.equal(env.GITHUB_ACTIONS,'true');
 assert(allowed(env,JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'))),'Exact standalone diagnostic push required');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(head,env.GITHUB_SHA);assert.match(head,/^[a-f0-9]{40}$/);assert.match(env.GITHUB_RUN_ID,/^\d+$/);
 assertCleanTree();
 return {sourceCommit:head,ciRunId:env.GITHUB_RUN_ID,mergeQualification:false};
}
export function safeReuseFailure(error){return 'Official build restore refused; no rebuild fallback. Diagnostic SHA256 '+createHash('sha256').update(String(error)).digest('hex');}
export const shots=['scale-author-preview','form-author-editor','form-author-preview','fixed-version-selection-preview','scale-answer','personal-fixed-version-report','typed-single-restored','typed-multiple','typed-matrix-row-refusal','form-completed-no-score'];
export function verifyReport(report,{head,tree,runId,frontend,backend,reuse},readScreenshot){
 assert.equal(report.schemaVersion,1);assert.equal(report.status,'PASSED');assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.source,{head,tree});
 assert.deepEqual(report.startups,[{product:'SCHOOL',corsOrigin:'https://school.eduk12.top',ready:true,phase:'READY'},{product:'TEACHER',corsOrigin:'https://teacher.eduk12.top',ready:true,phase:'READY'}]);
 verifyReceipt(reuse,head,runId);assert.deepEqual(report.buildReuse,reuse);
 for(const kind of ['frontend','backend']){const m=report.inputs[kind];assert.deepEqual(m,kind==='frontend'?frontend:backend);assert.deepEqual(m,expectedManifest(kind));}
 const expected=[];
 for(const product of ['SCHOOL','TEACHER'])for(const check of ['author-SCALE','author-FORM','fixed-version-preview-publish',`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-SCALE`,`separate-${product==='SCHOOL'?'STUDENT':'TEACHER'}-SELF-FORM`])expected.push(product+':'+check);
 expected.push('TEACHER:ordinary-psychology-author-real-API');
 assert.deepEqual(report.coverage.map(c=>c.product+':'+c.check).sort(),expected.sort());
 const expectedShots=['school','teacher'].flatMap(p=>[1440,390].flatMap(w=>shots.map(n=>`screenshots/${p}-${n}-${w}.png`)));
 assert.deepEqual(report.screenshots.map(s=>s.file).sort(),expectedShots.sort());
 for(const s of report.screenshots){
  const width=s.file.endsWith('-1440.png')?1440:390;assert.deepEqual(s.viewport,{width,height:width===1440?900:844});
  assert.equal(s.layout.width,width);assert(s.layout.scrollWidth<=width+1);assert.equal(s.layout.secretNodes,0);
  for(const key of ['focusVisible','visible','ring'])assert.equal(s.keyboard[key],true);
  assert.deepEqual(s.accessibility.violations,[]);assert(s.accessibility.passes>0);assert(Array.isArray(s.accessibility.incomplete));
  const bytes=readScreenshot(s.file);assert(bytes.length>8);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
 assert.equal(report.keyboard.length,8);
 for(const product of ['SCHOOL','TEACHER'])assert.deepEqual(report.keyboard.filter(k=>k.product===product).map(k=>k.control).sort(),['checkbox','radio','radio','scale-option-button']);
 for(const k of report.keyboard){assert.equal(k.action,'Space');assert.equal(k.selected,true);assert.equal(k.focusVisible,true);}
 assert.deepEqual(report.sessions.map(s=>s.product+':'+s.actor).sort(),['SCHOOL:author','SCHOOL:participant','TEACHER:author','TEACHER:ordinary-psychology-author','TEACHER:participant']);
 for(const s of report.sessions){
  for(const key of ['pageErrors','unexpectedRequests','requestFailures'])assert.deepEqual(s[key],[]);
  assert(Array.isArray(s.expectedFailures));
  for(const f of s.failedResponses)assert(s.expectedFailures.includes(f.path+':'+f.status));
  for(const c of s.consoleErrors)assert(c.network&&s.failedResponses.some(f=>f.path===c.path&&s.expectedFailures.includes(f.path+':'+f.status)));
 }
 assert(report.notCovered.some(s=>/storage/i.test(s)));assert(report.notCovered.some(s=>/TLS/.test(s)));
 return {schemaVersion:1,status:'PASSED',sourceCommit:head,tree,ciRunId:runId,mergeQualification:false,scope:'Standalone School/Teacher synthetic browser diagnostic',coverage:11,screenshots:40,buildReuse:reuse,notCovered:report.notCovered};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const command=process.argv[2];assert(['preflight','report','cleanup','restore'].includes(command));
 const identity=preflight();
 if(command==='restore'){
  try{await restoreBuilds(identity);console.log('Verified original successful builds; original browser failure retained; browser must execute.');}
  catch(error){console.error(safeReuseFailure(error));process.exitCode=1;}
 }else if(command==='cleanup'){
  const root=realpathSync(process.env.RUNNER_TEMP),target=resolve(process.env.SCHOOL_TEACHER_PRIVATE_DIR);
  assert.equal(target,join(root,'school-teacher-private'));assert.equal(realpathSync(dirname(target)),root);
  if(existsSync(target)){assert.equal(realpathSync(target),target);rmSync(target,{recursive:true});}
  const seedLog=join(root,'school-teacher-seed.log');if(existsSync(seedLog)){assert.equal(realpathSync(seedLog),seedLog);rmSync(seedLog);}
  mkdirSync('school-teacher-evidence',{recursive:true});writeFileSync('school-teacher-evidence/cleanup.json',JSON.stringify({...identity,privateMaterialRemoved:!existsSync(target)})+'\n');
 }else if(command==='report'){
  const workspace=process.env.GITHUB_WORKSPACE,out=join(workspace,'school-teacher-evidence');
  const frontend=JSON.parse(readFileSync(join(workspace,'server-version/frontend/dist/ci-build-manifest.json'),'utf8'));
  const backend=JSON.parse(readFileSync(join(workspace,'server-version/backend/dist/ci-build-manifest.json'),'utf8'));
  const report=JSON.parse(readFileSync(join(out,'browser.json'),'utf8'));
  const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
  const reuse=JSON.parse(readFileSync(join(out,'reused-builds.json'),'utf8'));
  const accepted=verifyReport(report,{head:identity.sourceCommit,tree,runId:identity.ciRunId,frontend,backend,reuse},file=>readFileSync(join(out,file)));
  writeFileSync(join(out,'acceptance.json'),JSON.stringify(accepted,null,2)+'\n');
 }
}
