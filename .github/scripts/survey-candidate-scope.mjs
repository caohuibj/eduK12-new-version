import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./survey-candidate-bindings.json',import.meta.url),'utf8'));
const tests=JSON.parse(readFileSync(new URL('./survey-candidate-tests.json',import.meta.url),'utf8'));
export const surveyCandidateRequired=['frozen-boundary','changed-builds-types','missing-survey-contracts','integrated-postgres-contracts','production-redis-limits','new-schema-restore','restricted-runtime','runtime-scans','three-role-browser','sast'];
const tools=new Set(['.github/scripts/survey-candidate-bindings.json','.github/scripts/survey-candidate-tests.json','.github/scripts/survey-candidate-scope.mjs','.github/scripts/survey-candidate-scope.test.mjs','.github/scripts/survey-candidate.py','.github/scripts/survey-candidate-runtime.cjs','.github/scripts/survey-candidate-recovery.py','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-survey-candidate.yml','docs/release/README.md','server-version/e2e/survey-candidate-browser.cjs','server-version/backend/scripts/survey-candidate-fixture.ts']);
const blob=(ref,file)=>execFileSync('git',['rev-parse',ref+':'+file],{encoding:'utf8'}).trim();
export function admitsSurveyCandidate(entries,read,approved=bindings){
 if(approved?.schema!==1||!approved.files||!Object.keys(approved.files).length||!entries.length)return false;
 if(!Object.keys(approved.files).every(f=>entries.some(e=>e.file===f)))return false;
 const seen=new Set();
 for(const e of entries){
  if(seen.has(e.file)||e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return false;
  seen.add(e.file);
  const b=approved.files[e.file];
  if(b){if(read('head',e.file)!==b.after||!/^[a-f0-9]{40}$/.test(b.after)||
   (b.before===null?e.status!=='A':e.status!=='M'||read('base',e.file)!==b.before))return false;}
  else if(!tools.has(e.file))return false;
 }
 return true;
}
export function surveyCandidatePlan(entries,base,head){
 if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head))throw Error('Full source SHAs required');
 if(base!==bindings.base||!admitsSurveyCandidate(entries,(ref,file)=>blob(ref==='base'?base:head,file)))return null;
 for(const f of ['server-version/backend/package.json','server-version/backend/package-lock.json','server-version/backend/Dockerfile','server-version/frontend/package.json','server-version/frontend/package-lock.json','server-version/frontend/Dockerfile'])if(blob(base,f)!==blob(head,f))return null;
 if(tests.schema!==1||!tests.backendTests?.length||!tests.frontendTests?.length)throw Error('Missing frozen test selection');
 for(const [component,selected]of [['backend',tests.backendTests],['frontend',tests.frontendTests]]){
  if(new Set(selected).size!==selected.length||selected.some(f=>!/^src\/.+\.test\.tsx?$/.test(f)))throw Error('Malformed test selection');
  for(const f of selected)blob(head,'server-version/'+component+'/'+f);
 }
 return {schema:1,route:'survey-candidate',base,head,tree:blob(head,''),changes:entries,changed:['frontend','backend'],components:{frontend:blob(head,'server-version/frontend'),backend:blob(head,'server-version/backend')},backendTests:tests.backendTests,frontendTests:tests.frontendTests,selectionBlob:blob(head,'.github/scripts/survey-candidate-tests.json'),required:surveyCandidateRequired};
}
