import {copyTools} from '../../../.github/scripts/homepage-copy-scope.mjs';
import {cognitiveIntakeToolingInputs} from '../../../.github/scripts/cognitive-intake-scope.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../../../.github/release-tools/package.json',import.meta.url));
let ts;
function parser(){ts ??= require('typescript');return ts;}
export const VERSION=1;
const front='server-version/frontend/';
const css=new Map(Object.entries({
 'paper-ink.css':['home','auth','workspace'],
 'training-auth-refresh.css':['auth'],
 'training-brand.css':['home','auth','workspace','admin'],
 'training-home-brand.css':['home'],
 'training-portal-refresh.css':['home'],
 'training-subpages-refresh.css':['workspace'],
 'training-workspace-refresh.css':['workspace'],
}).map(([n,surfaces])=>[front+'src/training/'+n,surfaces]));
css.set(front+'src/pages/admin/admin-training.css',['admin']);
css.set(front+'src/pages/questionnaire/questionnaire-products.css',['workspace']);
const portal=front+'src/training/TrainingPortal.tsx';
const login='server-version/backend/src/controllers/authController.ts';
const loginTests=new Set(['server-version/backend/src/__tests__/controllers/login-admission.test.ts',front+'src/pages/StudentLogin.roles.test.tsx']);
export const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export const canonical=x=>JSON.stringify(x,Object.keys(x).sort());
function git(...args){return execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});}
function readAt(sha,file){return git('show',`${sha}:${file}`);}
export function entries(base,head){
 for(const sha of [base,head])if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Full SHA required');
 const raw=git('diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40','-z',base,head,'--');
 if(!raw)return [];
 if(!raw.endsWith('\0'))throw Error('Invalid diff');
 const a=raw.slice(0,-1).split('\0'),out=[];if(a.length%2)throw Error('Invalid records');
 for(let i=0;i<a.length;i+=2){const m=/^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/.exec(a[i]);if(!m||!a[i+1])throw Error('Invalid entry');out.push({file:a[i+1],oldMode:m[1],newMode:m[2],oldBlob:m[3],newBlob:m[4],status:m[5]});}return out;
}
function ast(text){parser();const f=ts.createSourceFile('surface.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(f.parseDiagnostics.length)throw Error('Invalid TSX');return f;}
function imports(text){return ast(text).statements.filter(ts.isImportDeclaration).map(n=>n.getText()).join('\n');}
export function portalBoundary(before,after){
 if(imports(before)!==imports(after))return false;
 // This exact public component owns only local mode state. No arbitrary runtime
 // module or directory is admitted. New calls, endpoints or side effects escalate.
 const allowed=new Set(['useAuthLinks','useState','setMode','authLink',"(['login', 'register'] as const).map",'new Date().getFullYear']);
 let ok=true;const walk=n=>{
  if(ts.isIdentifier(n)&&['window','document','globalThis','localStorage','sessionStorage','navigator','fetch','eval','Function','XMLHttpRequest'].includes(n.text))ok=false;
  if(ts.isJsxAttribute(n)&&n.name.getText()==='dangerouslySetInnerHTML')ok=false;
  if(ts.isCallExpression(n)&&!allowed.has(n.expression.getText()))ok=false;
  if(ts.isNewExpression(n)&&n.expression.getText()!=='Date')ok=false;
  if(ts.isAwaitExpression(n)||ts.isThrowStatement(n)||ts.isDeleteExpression(n)||ts.isAssignmentExpression?.(n))ok=false;
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)ok=false;
  ts.forEachChild(n,walk);
 };walk(ast(after));
 const endpoints=t=>[...t.matchAll(/['"](\/(?:student|teacher)\/[^'"]+)['"]/g)].map(m=>m[1]).sort();
 return ok&&JSON.stringify(endpoints(before))===JSON.stringify(endpoints(after));
}
export function loginBoundary(before,after){
 // Only the entrance schema/admission block can change; hashing, account state,
 // rate limits, token issuance, cookies and every other handler stay byte exact.
 const erase=t=>t.replace(/  expectedRole: z\.enum\(\['STUDENT', 'TEACHER'\]\)\.optional\(\),\n/g,'')
 .replace(/      \/\/ Verify the entrance[\s\S]*?(?=      await clearLoginFailures)/,'')
 .replace(/      const \{ username, password(?:, expectedRole)? \} = result.data/,'      const { username, password } = result.data');
 if(erase(before)!==erase(after))return false;
 const block=after.match(/      \/\/ Verify the entrance[\s\S]*?(?=      await clearLoginFailures)/)?.[0]||'';
 // Changes outside this precise guard need the broader permission lane.
 return !block||/^      \/\/[^\n]*\n(?:      \/\/[^\n]*\n)*      if \(expectedRole && user\.role !== expectedRole\) \{\n        return error\(res, expectedRole === 'STUDENT'\n          \? '[^'\n]*'\n          : '[^'\n]*', -1, 403\)\n      \}\n\n$/.test(block);
}
export function classify(changes,read){
 const reasons=[],surfaces=new Set(),kinds=new Set();
 if(!changes.length)return {route:'C',reasons:['empty-or-unproven-diff'],surfaces:[]};
 for(const e of changes){
  if(!['A','M'].includes(e.status)||e.newMode!=='100644'||(e.status==='M'&&e.oldMode!=='100644')||(e.status==='A'&&e.oldMode!=='000000')){reasons.push(`${e.file}: deletion/rename/type/mode`);continue;}
  const [before,after]=read(e);
  if(css.has(e.file)&&!after.includes('\\')&&[...after.matchAll(/url\((.*?)\)/gi)].every(m=>before.includes(m[0])||["url('./training-landscape-v2.webp')"].includes(m[0]))&&!/(@import|expression\s*\(|javascript\s*:|https?:|\/\/)/i.test(after)){kinds.add('A');css.get(e.file).forEach(s=>surfaces.add(s));}
  else if(e.file===portal&&e.status==='M'&&portalBoundary(before,after)){kinds.add('A');surfaces.add('home');}
  else if(e.file===login&&e.status==='M'&&loginBoundary(before,after)){kinds.add('B');surfaces.add('auth');}
  else if(loginTests.has(e.file)&&e.status==='M'&&changes.some(c=>c.file===login)){kinds.add('B');surfaces.add('auth');}
  else reasons.push(`${e.file}: unknown or unproven boundary`);
 }
 return {route:reasons.length?'C':kinds.has('B')?'B':'A',reasons,surfaces:[...surfaces].sort()};
}
// Passive engineering records do not change an application consumer. Executable
// fixtures and scientific/publication inputs retain their existing routes.
export function engineeringEvidenceFile(file) {
 return typeof file==='string' && !/[\\\x00-\x1f\x7f]/.test(file)
  && file.split('/').every(p=>p&&p!=='.'&&p!=='..')
  && (/^docs\/cua-[a-zA-Z0-9_-]+\.md$/.test(file) || /^docs\/(?:development|performance|evidence)\/[a-zA-Z0-9_./-]+\.(?:md|json|json\.gz|txt|log|exit)$/.test(file));
}
export const backendTestFile=file=>typeof file==='string'&&/^server-version\/backend\/src\/__tests__\/[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9_-]+)*\.test\.ts$/.test(file)&&file.split('/').every(p=>p&&p!=='.'&&p!=='..');
// Tooling-only C is not an application release. Registered development tools
// may travel with their changed tests; runtime source and unknown modes escalate.
const selectedCognitiveControlFiles=new Set(cognitiveIntakeToolingInputs.filter(file=>file.startsWith('server-version/backend/')));
const selectedScaleControlFiles=new Set(['server-version/backend/scripts/scale-intake-selected-check.ts','server-version/backend/scripts/scale-intake-selected-check.test.ts']);
const imageBuildInputs=new Set([
 '.github/scripts/build-ci-images.sh','.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci-images.yml',
 'server-version/frontend/Dockerfile','server-version/backend/Dockerfile',
]);
const imageBuildControls=new Set([
 'AGENTS.md','docs/release/README.md',
 '.github/scripts/content-scope.mjs','.github/scripts/content-scope.test.mjs','.github/scripts/merge-gate.mjs',
 '.github/scripts/local-validation.mjs','.github/scripts/local-validation.test.mjs',
 '.github/workflows/ci.yml','.github/workflows/ci-release-tools.yml',
 'server-version/scripts/release/policy.mjs','server-version/scripts/release/policy.test.mjs',
]);
export const imageBuildFile=file=>imageBuildInputs.has(file);
export function imageBuildOnly(entries){
 return entries.some(e=>imageBuildFile(e.file))&&entries.every(e=>
  (imageBuildFile(e.file)||imageBuildControls.has(e.file))&&e.status==='M'
  &&e.oldMode===(e.file==='.github/scripts/build-ci-images.sh'?'100755':'100644')&&e.newMode===e.oldMode);
}
const releaseToolFiles=new Set([
 ...copyTools,
 '.github/scripts/onboarding-scope.mjs','.github/scripts/onboarding-controls.test.mjs',
 'docs/development/ci-gate-cleanup-20261031.md',
 ".github/scripts/school-teacher-native.mjs", ".github/scripts/school-teacher-native.test.mjs",
 "docs/performance/codeql-analysis-20261030.md",
 ...cognitiveIntakeToolingInputs,
 'docs/development/cognitive-intake-ci-20261029.md',
 '.agents/skills/eduk12-cognitive-intake/SKILL.md',
 '.agents/skills/eduk12-cognitive-intake/references/workflow.md',
 '.agents/skills/eduk12-cognitive-intake/assets/instrument.json',
 '.agents/skills/eduk12-cognitive-intake/assets/batch.json',
 'docs/cognitive-intake/PROJECT-INSTRUCTIONS.md',
 'docs/cognitive-intake/USE-IN-CHAT.md',

 '.github/scripts/scale-intake-scope.mjs','.github/scripts/scale-intake-scope.test.mjs',
 '.github/scripts/admin-permissions-functional.test.mjs','.github/scripts/ci-topology.test.mjs',
 '.github/scripts/content-workflows.test.mjs','.github/scripts/maintenance-routing.test.mjs',
 '.github/scripts/dependency-scope.mjs','.github/scripts/dependency-routing.test.mjs',
 '.github/scripts/build-ci-images.sh','.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci-images.yml',
 '.github/workflows/scale-onboarding-boundary.yml',
 ...selectedScaleControlFiles,
 'docs/development/scale-intake-ci-20261029.md',
 'server-version/ops/nginx/nginx.production.conf','server-version/ops/nginx/eduk12-products.conf','server-version/ops/nginx/eduk12-school.conf','server-version/ops/nginx/renew-school.sh',
 '.github/PULL_REQUEST_TEMPLATE.md','.github/release-tools/package.json','.github/release-tools/package-lock.json',
 'docs/miniprogram-v2/web-feature-inventory.json',
 '.github/workflows/ci.yml','.github/workflows/ci-frontend.yml','.github/workflows/ci-scoped-release.yml','.github/workflows/ci-release-tools.yml','.github/workflows/ci-maintenance.yml',
 '.github/scripts/content-scope.mjs','.github/scripts/content-scope.test.mjs','.github/scripts/merge-gate.mjs',
 '.github/scripts/local-validation.mjs','.github/scripts/local-validation.test.mjs','.github/scripts/local-validation.integration.test.mjs',
 '.gitignore','AGENTS.md','docs/ci-runner-policy.md','docs/release/README.md','docs/release/operations.md','docs/release/audit-20261009.md','docs/release/validation-20261009.md',
 'server-version/docs/release-candidate-checklist-v1.md','server-version/docs/release-verify-local.md',
 ...['ingress.py','test_ingress.py','policy.mjs','policy.test.mjs','evidence.py','executor.py','test_executor.py','qualify.py','test_qualify.py','browser.cjs','candidate.py','fixture-server.cjs','build.py','scan.py','package.py','ci-container-rehearsal.py','compose-overlay.example.sh','update.sh'].map(f=>'server-version/scripts/release/'+f),
]);
export function toolingOnly(entries){
 if(entries.some(e=>imageBuildFile(e.file)))return imageBuildOnly(entries);
 return entries.some(e=>releaseToolFiles.has(e.file))&&entries.every(e=>(releaseToolFiles.has(e.file)||engineeringEvidenceFile(e.file)||backendTestFile(e.file))&&(e.file==='.github/scripts/build-ci-images.sh'?e.status==='M'&&e.oldMode==='100755'&&e.newMode==='100755':e.file==='server-version/scripts/release/update.sh'?e.newMode==='100755'&&((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100755')):e.newMode==='100644'&&((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'))));
}
export function componentFingerprint(sha,component){
 const roots=component==='frontend'?[front]:['server-version/backend/'];
 const files=git('ls-tree','-r',sha,'--',...roots).trim().split('\n').filter(Boolean);
 // backend tsconfig excludes src/__tests__; these files do not enter dist.
 return hash(files.filter(row=>{const file=row.split('\t')[1];return !selectedScaleControlFiles.has(file)&&!selectedCognitiveControlFiles.has(file)&&!backendTestFile(file)}).join('\n'));
}
function toolFingerprint(sha,files){try{return hash(files.map(f=>`${f}\0${readAt(sha,f)}`).join('\0'));}catch{return null;}}
export function plan(base,head){
 const changes=entries(base,head),classification=classify(changes,e=>[e.status==='A'?'':readAt(base,e.file),readAt(head,e.file)]);
 const components={};for(const c of ['frontend','backend'])components[c]={base:componentFingerprint(base,c),candidate:componentFingerprint(head,c)};
 const changed=Object.keys(components).filter(c=>components[c].base!==components[c].candidate);
 const required=['policy','compatibility','rollback','readiness'];
 if(changed.includes('frontend'))required.push('frontend-checks','frontend-scan','frontend-browser');
 if(changed.includes('backend'))required.push('backend-checks','backend-scan','login-contracts','login-browser');
 if(classification.route==='B'&&!required.includes('login-contracts'))required.push('login-contracts','login-browser');
 if(classification.route==='B'||changes.some(e=>e.file===portal))required.push('sast');
 if(classification.route==='C')required.push('platform-gate','data-recovery-if-affected');
 const toolFiles=['server-version/scripts/release/policy.mjs','server-version/scripts/release/package.py','server-version/scripts/release/qualify.py','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/release-tools/package.json','.github/release-tools/package-lock.json'];
 const tools={policy:toolFingerprint(head,toolFiles),browser:toolFingerprint(head,['server-version/scripts/release/browser.cjs','server-version/scripts/release/candidate.py','server-version/scripts/release/fixture-server.cjs','.github/release-tools/package-lock.json']),executor:toolFingerprint(head,['server-version/scripts/release/executor.py','server-version/scripts/release/evidence.py']),scan:toolFingerprint(head,['server-version/scripts/release/scan.py','.github/workflows/ci-scoped-release.yml']),build:toolFingerprint(head,['server-version/scripts/release/build.py','.github/workflows/ci-scoped-release.yml']),frontendChecks:toolFingerprint(head,['server-version/scripts/release/build.py','.github/workflows/ci-scoped-release.yml']),backendChecks:toolFingerprint(head,['.github/workflows/ci-scoped-release.yml'])};
 if(Object.values(tools).some(x=>!x)){classification.route='C';classification.reasons.push('Candidate validation tools missing');if(!required.includes('platform-gate'))required.push('platform-gate','data-recovery-if-affected');}
 return {schema:VERSION,base,head,...classification,components,changed,required:required.sort(),tools,changes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [base,head]=process.argv.slice(2),p=plan(base,head);console.log(JSON.stringify(p,null,2));
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`application_route=${p.route==='C'?'legacy':p.route}\nrelease_plan=${JSON.stringify(p)}\n`);
}
