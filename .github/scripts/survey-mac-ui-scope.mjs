import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const surveyMacRequired = ['bound-inputs','frontend-build-once','changed-lint','actual-types','affected-tests','dependency-audit','runtime-scan','chromium-wcag','webkit-recovery','sast'];
export const surveyMacTools = [
  ...['bindings.json','test-selection.json','scope.mjs','scope.test.mjs','candidate.py','candidate.test.py','browser.mjs'].map(s=>'.github/scripts/survey-mac-ui-'+s),
  '.github/workflows/ci-survey-mac-ui.yml','.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','docs/release/README.md',
];
const sha = s => /^[a-f0-9]{40}$/.test(s || '');
const git = args => execFileSync('git', args, {encoding:'utf8'}).trim();
const object = (ref,path='') => git(['rev-parse',ref+':'+path]);
export const knownSurveyManual = (event,ref) => event==='workflow_dispatch'&&ref==='refs/heads/survey/mac-visual-s01-20261019';
export function rejectSurveyManual(env=process.env) {
  if(knownSurveyManual(env.CI_EVENT,env.GITHUB_REF)) throw Error('Known Survey Mac candidate refuses every manual full/probe entry; only independently reviewed PR qualification is supported');
}
export function rawSurveyDiff(base,head) {
  const raw = execFileSync('git',['diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40','-z',base,head,'--'],{encoding:'utf8'});
  if (!raw) return [];
  if (!raw.endsWith('\0')) throw Error('Malformed diff');
  const fields=raw.slice(0,-1).split('\0'), entries=[];
  if (fields.length%2) throw Error('Malformed records');
  for(let i=0;i<fields.length;i+=2) {
    const m=/^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/.exec(fields[i]);
    if(!m) throw Error('Unsupported diff record');
    entries.push({file:fields[i+1],oldMode:m[1],newMode:m[2],before:m[3],after:m[4],status:m[5]});
  }
  return entries;
}
export function admitsSurveyMac(entries,bindings,read) {
  if(bindings?.schema!==1 || !Array.isArray(bindings.files) || !bindings.files.length) return false;
  const fixed=new Map(bindings.files.map(f=>[f.path,f]));
  if(fixed.size!==bindings.files.length) return false;
  const seen=new Set();
  for(const e of entries) {
    if(typeof e.file!=='string'||/[\\\x00-\x1f\x7f]/.test(e.file)||e.file.split('/').some(s=>!s||s==='.'||s==='..')
       ||seen.has(e.file)||e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'))) return false;
    seen.add(e.file);
    const f=fixed.get(e.file);
    if(f) {
      if(e.status!==f.status||e.oldMode!==f.oldMode||e.newMode!==f.newMode||!sha(f.after)||read('head',e.file)!==f.after
         ||(e.status==='M'&&(!sha(f.before)||read('base',e.file)!==f.before))) return false;
    } else if(!surveyMacTools.includes(e.file)) return false;
  }
  return [...fixed.keys(),...surveyMacTools].every(f=>seen.has(f));
}
export function surveyMacPlan(entries,base,head,env=process.env,io={}) {
  const required=env.CI_SURVEY_MAC_REQUIRED==='true';
  const get=io.object??object, diff=io.diff??rawSurveyDiff;
  // Unrelated routes never depend on this route's approval variable.
  const b=io.bindings??JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url),'utf8'));
  if(!required && env.CI_EVENT!=='push') return null;
  if(!required && base!==b.base) return null;
  const refuse=message=>{if(required) throw Error('Survey Mac scope refused: '+message);return null;};
  if(!sha(base)||!sha(head)||base!==b.base) return refuse('wrong base/head');
  const reviewed=env.SURVEY_MAC_UI_REVIEWED_HEAD;
  if(!sha(reviewed)) return refuse('independent reviewed tools HEAD missing');
  const source=env.CI_EVENT==='push'?reviewed:env.CI_SURVEY_MAC_SOURCE_HEAD;
  if(source!==reviewed || !sha(source)) return refuse('source differs from independent review');
  if(get(head)!==get(reviewed)) return refuse('checkout/merge tree differs from reviewed source');
  if(get(source,'server-version/frontend')!==b.frontendTree||get(b.productHead,'server-version/frontend')!==b.frontendTree) return refuse('frontend product changed');
  const full=diff(base,head);
  if(JSON.stringify(entries.map(({file,oldMode,newMode,status})=>({file,oldMode,newMode,status})))!==JSON.stringify(full.map(({file,oldMode,newMode,status})=>({file,oldMode,newMode,status})))) return refuse('incomplete supplied diff');
  if(!admitsSurveyMac(full,b,(ref,file)=>get(ref==='base'?base:head,file))) return refuse('unreviewed path/blob/mode');
  for(const [path,value] of Object.entries({...b.protected,...b.externalFixtures}))
    if(get(base,path)!==value||get(head,path)!==value) return refuse('protected input '+path);
  // Independently pinned final source closes the entire tooling tree, including
  // this verifier, both manifests, imported routers, workflows and lockfiles.
  const closurePaths=['.github','server-version/scripts/release','server-version/frontend',...Object.keys(b.externalFixtures)];
  const inputs=Object.fromEntries(closurePaths.map(path=>[path,get(head,path)]));
  for(const path of closurePaths) if(inputs[path]!==get(reviewed,path)) return refuse('tools closure '+path);
  const selection=io.selection??JSON.parse(readFileSync(new URL('./survey-mac-ui-test-selection.json',import.meta.url),'utf8'));
  const tests=b.affectedFrontendTests?.map(f=>f.file)??[];
  if(selection.schema!==1||tests.length!==21||new Set(tests).size!==21||JSON.stringify(selection.frontendTests)!==JSON.stringify(tests)||!selection.requiredRecoveryCases?.length) return refuse('test selection');
  if(!selection.frontendTestBlobs||Object.keys(selection.frontendTestBlobs).length!==21||b.affectedFrontendTests.some(t=>selection.frontendTestBlobs[t.file]!==t.blob)) return refuse('test selection input blobs');
  if(b.files.filter(f=>f.category==='test').some(f=>!tests.includes(f.path.replace('server-version/frontend/','')))) return refuse('changed test missing');
  for(const test of b.affectedFrontendTests) if(!/^src\/.+\.test\.tsx?$/.test(test.file)||get(head,'server-version/frontend/'+test.file)!==test.blob) return refuse('affected test input '+test.file);
  return {schema:1,route:'survey-mac-ui',base,head,sourceHead:source,reviewedHead:reviewed,tree:get(head),productHead:b.productHead,
    frontendTree:b.frontendTree,changed:['frontend'],changes:full,inputs,frontendTests:tests,required:surveyMacRequired};
}
export function validSurveyMacPlan(p) {
  const b=JSON.parse(readFileSync(new URL('./survey-mac-ui-bindings.json',import.meta.url),'utf8'));
  const keys=['.github','server-version/scripts/release','server-version/frontend',...Object.keys(b.externalFixtures)];
  return Boolean(p?.schema===1&&p.route==='survey-mac-ui'&&[p.base,p.head,p.sourceHead,p.reviewedHead,p.tree,p.productHead,p.frontendTree].every(sha)
    &&p.sourceHead===p.reviewedHead&&JSON.stringify(p.changed)==='["frontend"]'&&p.changes?.length===324
    &&p.base===b.base&&p.productHead===b.productHead&&p.frontendTree===b.frontendTree
    &&p.frontendTests?.length===21&&JSON.stringify(p.frontendTests)===JSON.stringify(b.affectedFrontendTests.map(f=>f.file))
    &&p.inputs&&Object.keys(p.inputs).length===keys.length&&keys.every(k=>sha(p.inputs[k]))
    &&p.inputs['server-version/frontend']===b.frontendTree&&p.inputs['server-version/scripts/release']===b.protected['server-version/scripts/release']
    &&Object.entries(b.externalFixtures).every(([k,v])=>p.inputs[k]===v)
    &&admitsSurveyMac(p.changes,b,(ref,path)=>p.changes.find(e=>e.file===path)?.[ref==='base'?'before':'after'])
    &&JSON.stringify(p.required)===JSON.stringify(surveyMacRequired));
}
export function recheckSurveyMac(p,env=process.env) {
  const head=git(['rev-parse','HEAD']);
  if(!validSurveyMacPlan(p)||p.head!==head||JSON.stringify(surveyMacPlan(rawSurveyDiff(p.base,head),p.base,head,{...env,CI_SURVEY_MAC_REQUIRED:'true'}))!==JSON.stringify(p)) throw Error('Recomputed Survey Mac plan mismatch');
  return p;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const p=recheckSurveyMac(JSON.parse(process.env.PLAN));
  writeFileSync('survey-mac-ui-plan.json',JSON.stringify(p,null,2));
}
