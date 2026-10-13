import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bindings=JSON.parse(readFileSync(new URL('./teacher-survey-bindings.json',import.meta.url)));
export const required=Object.freeze(['bound-input-proof','frontend-build-once','affected-ui-contracts','runtime-scan','affected-runtime-browser','sast']);
const tools=new Set(['.github/scripts/teacher-survey-bindings.json','.github/scripts/teacher-survey-scope.mjs','.github/scripts/teacher-survey-scope.test.mjs','.github/scripts/teacher-survey-candidate.py','.github/scripts/teacher-survey-browser.mjs','.github/scripts/teacher-survey-contracts.test.tsx','.github/workflows/ci-teacher-survey.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','docs/release/README.md']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function teacherSurveyPlan(entries,base,head,read=git){
 if(!/^[a-f0-9]{40}$/.test(base||'')||!/^[a-f0-9]{40}$/.test(head||'')||!entries.length||!entries.some(e=>Object.hasOwn(bindings.application,e.file)))return null;
 for(const e of entries){
  if(!Object.hasOwn(bindings.application,e.file)&&!tools.has(e.file))return null;
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))return null;
  const b=bindings.application[e.file];
  if(b&&(read('rev-parse',head+':'+e.file)!==b.after||(b.before&&(e.status!=='M'||read('rev-parse',base+':'+e.file)!==b.before))||(!b.before&&e.status!=='A')))return null;
 }
 for(const[file,b]of Object.entries(bindings.application)){
  if(read('rev-parse',head+':'+file)!==b.after||!entries.some(e=>e.file===file))return null;
 }
 const backend=read('rev-parse',head+':server-version/backend');
 if(backend!==read('rev-parse',base+':server-version/backend'))return null;
 return {schema:1,route:'teacher-survey',base,head,changed:['frontend'],frontendTree:read('rev-parse',head+':server-version/frontend'),backendTree:backend,changes:entries,required:[...required],proof:bindings};
}
