import { createHash } from 'node:crypto';
import { classifyChanges, domainFor, documentationFile, presentationFile, frontendFile, maintenanceFile, acceptanceFor } from './content-scope.mjs';

export const LANES = Object.freeze({
  'mac-light': ['self-hosted','macOS','ARM64','eduk12-mac-light'],
  'mac-heavy': ['self-hosted','macOS','ARM64','eduk12-mac-heavy'],
  'win-light': ['self-hosted','Linux','X64','eduk12-win-light'],
  'win-heavy': ['self-hosted','Linux','X64','eduk12-win-heavy'],
});
export const NODES = Object.freeze({
  preflight:{lane:'mac-light'}, documentation:{lane:'mac-light'}, mini:{lane:'mac-light'},
  'frontend-static':{lane:'mac-light'}, 'backend-static':{lane:'win-light'}, codeql:{lane:'win-light'},
  'frontend-production':{lane:'mac-heavy',produces:'frontend'},
  'frontend-ui-lab':{lane:'mac-heavy',produces:'frontend-ui-lab'},
  'frontend-regression':{lane:'mac-heavy'},
  'backend-build':{lane:'win-heavy',produces:'backend'},
  'backend-correctness':{lane:'win-heavy'}, 'backend-regression':{lane:'win-heavy'},
  api:{lane:'win-heavy',consumes:['frontend','backend']},
  media:{lane:'win-heavy',consumes:['frontend','backend']},
  'ui-critical':{lane:'mac-heavy',consumes:['frontend']},
  'ui-screenshots':{lane:'mac-heavy',consumes:['frontend-ui-lab']},
  'ui-interactions':{lane:'mac-heavy',consumes:['frontend-ui-lab']},
  'ui-round5':{lane:'mac-heavy',consumes:['frontend-ui-lab']},
  'ui-qa3':{lane:'mac-heavy',consumes:['frontend-ui-lab']},
  'ui-cross-browser':{lane:'win-heavy',consumes:['frontend-ui-lab']},
  images:{lane:'win-heavy'}, performance:{lane:'win-heavy',exclusive:true,consumes:['backend']},
  recovery:{lane:'win-heavy'}, maintenance:{lane:'win-heavy'}, content:{lane:'win-heavy'},
  'frontend-unit':{lane:'mac-light'}, 'backend-unit':{lane:'win-heavy'}, 'ci-component':{lane:'win-light'},
});
const frontend = 'server-version/frontend/';
const backend = 'server-version/backend/';
const testPath = file => /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec))\.[cm]?[jt]sx?$/.test(file);
const ciComponents = new Set(['.github/scripts/ci-timing-report.mjs','.github/scripts/ci-timing-report.test.mjs']);
// Start narrow. Unregistered backend modules and any shared scientific/security
// surface stay full; expanding this list requires a reviewed dependency boundary.
const isolatedBackend = file => file === backend+'src/utils/logger.ts'
  || /^server-version\/backend\/src\/modules\/legacy-archive\/[^\x00-\x1f\\]+\.ts$/.test(file);
const criticalFrontend = file => /(?:auth|session|cookie|token|permission|identity|password|persistence|assessment-runtime|assessment-context|cognitive|situational|composite|assessment-bundle|scoring|finalizer|trial-timing)/i.test(file);
const validEntry = e => typeof e.file === 'string' && !/[\\\x00-\x1f\x7f]/.test(e.file)
  && !e.file.split('/').some(x=>!x||x==='.'||x==='..')
  && e.newMode === '100644' && ((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'));
const js = file => /\.[cm]?[jt]sx?$/.test(file);
const full = Object.keys(NODES).filter(x=>!['documentation','frontend-unit','backend-unit','ci-component','content'].includes(x));
const baseJobs = {
  documentation:['documentation'],
  presentation:['frontend-static','frontend-production','frontend-ui-lab','ui-screenshots'],
  frontend:['frontend-static','frontend-production','frontend-regression','backend-build','api','images','codeql'],
  backend:['backend-static','backend-build','backend-correctness','backend-regression','api','frontend-production','images','codeql'],
  content:['content'], maintenance:['maintenance'],
  dependencies:['frontend-static','backend-static','frontend-production','frontend-regression','backend-build','backend-correctness','backend-regression','images','performance','codeql'],
  'frontend-test':['frontend-unit','codeql'], 'backend-test':['backend-unit','codeql'], 'ci-component':['ci-component','codeql'],
  'ui-test':['frontend-ui-lab','ui-round5','codeql'],
};
const uiScripts = new Set(['qa-round5-more-actions-browser-e2e.cjs','qa-round5-anonymous-browser-e2e.cjs','qa-round5-sjt-upload-browser-e2e.cjs','qa-round5-workbench-browser-e2e.cjs'].map(x=>'server-version/e2e/'+x));
export function categoryFor(entry) {
  if (!validEntry(entry)) return 'platform';
  const file=entry.file;
  if(documentationFile(file))return 'documentation';
  if(maintenanceFile(file))return 'maintenance';
  if(domainFor(file))return 'content';
  if(ciComponents.has(file))return 'ci-component';
  if(uiScripts.has(file))return 'ui-test';
  if(testPath(file)&&file.startsWith(frontend))return 'frontend-test';
  if(testPath(file)&&file.startsWith(backend))return 'backend-test';
  if(isolatedBackend(file))return 'backend';
  if(presentationFile(file))return 'presentation';
  if(criticalFrontend(file))return 'platform';
  if(frontendFile(file))return 'frontend';
  return 'platform';
}
const bool = value => value === true;
export function validationPlan(entries,{sha,base,runId,draft=false,forceFull=false,postMerge=false,dependencyOnly=false,runtimeDependencies=false,acceptance}={}) {
  if(!/^[a-f0-9]{40}$/.test(sha??'')||!/^[a-f0-9]{40}$/.test(base??'')||!/^\d+$/.test(String(runId??'')))throw new Error('Exact SHA, base and run ID required');
  const files=entries.map(e=>e.file);
  const legacy=classifyChanges(entries);
  // The established maintenance/dependency boundaries retain their stricter
  // companion-file and manifest checks, rather than a generic prefix shortcut.
  let categories=forceFull?['platform']:dependencyOnly?['dependencies']:legacy.maintenance?['maintenance']:entries.map(categoryFor);
  if(!categories.length)categories=['platform'];
  if(categories.includes('maintenance')&&categories.some(x=>!['maintenance','documentation'].includes(x)))categories=['platform'];
  categories=[...new Set(categories)].sort();
  const scenario=categories.includes('platform')?'platform':categories.length===1?categories[0]:'mixed';
  const flags=acceptance??acceptanceFor(files);
  const selected=new Set(['preflight']);
  const reasons=[];
  if(scenario==='platform')for(const name of full)selected.add(name);
  else for(const category of categories)for(const name of baseJobs[category]??[])selected.add(name);
  // Shared CSS affects every layout. Never reduce it to a single-page smoke.
  const sharedLayout=files.some(f=>f.startsWith(frontend+'src/')&&/\.(css|scss)$/.test(f)&&!/pages\/[^/]+\//.test(f));
  if(sharedLayout||bool(flags.canonical_visual))for(const name of ['frontend-ui-lab','ui-critical','ui-screenshots','ui-interactions','ui-round5','ui-qa3','ui-cross-browser'])selected.add(name);
  if(bool(flags.app_shell))selected.add('ui-critical');
  const media=['media2','video_core','media7','situational_video','situational_branching'].filter(k=>bool(flags[k]));
  if(media.length){selected.add('media');selected.add('backend-build');selected.add('frontend-production');}
  if(bool(flags.perf_smoke))selected.add('performance');
  if(bool(flags.ops))selected.add('recovery');
  if(categories.includes('content')&&files.some(js))selected.add('codeql');
  if(categories.includes('content')&&files.some(f=>f.startsWith(backend+'src/'))){selected.add('backend-build');selected.add('images');}
  // Runtime dependency upgrades retain related browser/media coverage; unknown
  // runtime impact expands rather than suppresses scientific/runtime checks.
  if(dependencyOnly&&runtimeDependencies)for(const name of ['api','ui-critical','ui-interactions','ui-cross-browser','media'])selected.add(name);
  // Explicit producers are implied by their consumers; no latest-success build.
  let changed=true;while(changed){changed=false;for(const name of [...selected])for(const artifact of NODES[name].consumes??[]){const producer=Object.keys(NODES).find(id=>NODES[id].produces===artifact);if(!selected.has(producer)){selected.add(producer);changed=true;}}}
  if(draft&&!forceFull){
    for(const name of [...selected])if(!['preflight','documentation','mini','frontend-static','backend-static','ci-component','frontend-unit','backend-unit','maintenance','content'].includes(name))selected.delete(name);
    if(scenario==='platform'){selected.add('frontend-static');selected.add('backend-static');selected.add('mini');}
  }
  if(postMerge&&!forceFull&&!['documentation','maintenance','content'].includes(scenario)){selected.clear();for(const name of ['preflight','frontend-static','frontend-production','backend-build'])selected.add(name);}
  for(const entry of entries)reasons.push({file:entry.file,status:entry.status,oldMode:entry.oldMode,newMode:entry.newMode,category:forceFull?'platform':categoryFor(entry)});
  const required=Object.keys(NODES).filter(name=>selected.has(name));
  const plan={schemaVersion:2,sha,base,runId:String(runId),draft,forceFull,postMerge,dependencyOnly,runtimeDependencies,scenario,categories,required,omitted:Object.keys(NODES).filter(x=>!selected.has(x)),reasons,media:scenario==='platform'||(dependencyOnly&&runtimeDependencies)?['media2','video_core','media7','situational_video','situational_branching']:media,
    testFiles:files.filter(testPath),uiTestFiles:files.filter(f=>uiScripts.has(f)),jobs:Object.fromEntries(required.map(name=>[name,{...NODES[name],labels:LANES[NODES[name].lane]}]))};
  plan.digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');return plan;
}
export function verifyPlan(plan,expected){
  const {digest,...body}=plan;
  if(plan.schemaVersion!==2||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==digest)throw new Error('Malformed validation plan');
  for(const [key,value]of Object.entries(expected))if(plan[key]!==value)throw new Error('Validation plan '+key+' mismatch');
  if(!Array.isArray(plan.required)||new Set(plan.required).size!==plan.required.length||!plan.required.includes('preflight'))throw new Error('Missing/duplicated required checks');
  for(const name of plan.required){const node=NODES[name];if(!node||JSON.stringify(plan.jobs[name])!==JSON.stringify({...node,labels:LANES[node.lane]}))throw new Error('Invalid validation node '+name);}
  if(!Array.isArray(plan.omitted)||new Set(plan.omitted).size!==plan.omitted.length||plan.omitted.length+plan.required.length!==Object.keys(NODES).length||plan.omitted.some(x=>!NODES[x]||plan.required.includes(x)))throw new Error('Incomplete check inventory');
  return plan;
}
export function planFailures(plan,results,expected){
  verifyPlan(plan,expected);return plan.required.filter(name=>results[name]!=='success');
}

export function verifyDerivedPlan(plan,entries,options){
  verifyPlan(plan,{sha:options.sha,base:options.base,runId:String(options.runId)});
  const derived=validationPlan(entries,options);
  if(JSON.stringify(plan)!==JSON.stringify(derived))throw new Error('Validation plan does not match the complete source diff and invocation');
  return plan;
}
