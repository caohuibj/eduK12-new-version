import {unitOnly} from './ci-qualification.mjs';
import {studentDiscoveryScope} from './student-discovery-scope.mjs';
import {readEdgeScope,edgeConfigOutputs} from './edge-config-scope.mjs';
import {cognitiveMixedProductScope,cognitiveProductPlan,cognitiveProductOutputs} from './cognitive-product-scope.mjs';
import {backendApiFocus} from './backend-api-scope.mjs';
import {catalogDiscoveryScope,catalogDiffBase,bundleFamilyScope,bundleRuntimeScope,authoringPolishScope} from './catalog-discovery-scope.mjs';
import {selectCognitiveIntake, cognitiveTaskRoot} from './cognitive-intake-scope.mjs';
import {selectScaleIntake} from './scale-intake-scope.mjs';
import {declarationReaders,verifiedDeclarativeContent} from './declarative-content.mjs';
import {homepageCopyPlan,publicRenderBoundary} from './homepage-copy-scope.mjs';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mediaPlan } from './ci-media-plan.mjs';
import { dependencyScope, frontendDependencyFilesOnly } from './dependency-scope.mjs';
import { plan as applicationPlan, toolingOnly, imageBuildOnly, engineeringEvidenceFile, backendTestFile } from '../../server-version/scripts/release/policy.mjs';


const modules = 'server-version/backend/src/modules/';
const frontendSrc = 'server-version/frontend/src/';

// Only established content surfaces qualify. New engines, scorers, runners,
// shared helpers, dependencies and CI changes require the full gate.
export function domainFor(file) {
  if (typeof file !== 'string' || file.split('/').some(part => !part || part === '..' || part === '.')
      || /[\\\x00-\x1f\x7f]/.test(file)) return null;
  if (new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/(manifest|evidence-map|rules|report|profile|scientific|publication|context)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/fixtures/(valid|missing|invalid|not-applicable)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/ci-fixtures/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+\\.json$`).test(file)
      || file === `${modules}assessment-bundle/generated/packages.json`) return 'bundle';
  if (new RegExp(`^${modules}scale/instruments/[a-zA-Z0-9_-]+/[^/]+/(?:instrument\\.ts|source\\.json|README\\.md|THIRD_PARTY_LICENSE\\.md)$`).test(file)
      || file === `${modules}scale/instruments/learning-motivation-wave1-data.json`
      || file === `${modules}scale/onboarding/instruments.generated.ts`
      || file.startsWith('server-version/backend/src/__tests__/scale/instruments/')
      || file.startsWith('docs/scale-instruments/') || /^docs\/scale-intake\/[a-zA-Z0-9_./-]+\.(md|json|txt)$/.test(file)) return 'scale';
  if (new RegExp(`^${modules}situational/instruments/[^/]+/[^/]+/(instrument|publication|scientific)\\.json$`).test(file)
      || file === `${modules}situational/onboarding/instruments.generated.ts`) return 'situational';
  if (new RegExp(`^${modules}cognitive/tasks/[^/]+/(seeds|participant-presentation|governance|scientific)\\.ts$`).test(file)) return 'cognitive';
  return null;
}

export const contentCodeqlRequired=(entries,readers={})=>!verifiedDeclarativeContent(entries,readers,domainFor);

// Exact engineering/guidance documents only; other scientific/publication
// and deployment behavior paths keep their existing domain/platform checks.
export function documentationFile(file) {
  return typeof file === 'string' && !/[\\\x00-\x1f\x7f]/.test(file)
    && !file.split('/').some(part => !part || part === '.' || part === '..')
    && (['README.md', 'CONTRIBUTING.md', 'docs/ci-runner-policy.md', 'AGENTS.md', 'docs/release/README.md', '.github/PULL_REQUEST_TEMPLATE.md'].includes(file)
      || /^docs\/contributing\/[a-zA-Z0-9_./-]+\.md$/.test(file) || engineeringEvidenceFile(file));
}

export function presentationFile(file) {
  if (typeof file !== 'string' || file.split('/').some(part => !part || part === '..' || part === '.')
      || /[\\\x00-\x1f\x7f]/.test(file)) return false;
  return (file.startsWith(frontendSrc) && /\.(?:css|scss)$/.test(file))
    || /^server-version\/docs\/frontend-[a-zA-Z0-9_-]+\.md$/.test(file);
}

// UI-only changes must not introduce measurement algorithms, client runtime
// semantics, dependencies, or shared build/CI changes through a broad prefix.
export function frontendFile(file) {
  if (typeof file !== 'string' || file.split('/').some(part => !part || part === '..' || part === '.')
      || /[\\\x00-\x1f\x7f]/.test(file)) return false;
  if (!file.startsWith(frontendSrc) || !/\.(?:tsx?|css|scss)$/.test(file)) return false;
  return !/^server-version\/frontend\/src\/(?:modules\/(?:cognitive|situational|composite|assessment-runtime|assessment-bundle)\/|(?:api|types|services)\/|modules\/assessment-context\/|utils\/(?:scor|assessment|cognitive|situational)|.*(?:scoring|scorer|algorithm|finalizer|trial-timing|reference-data))/i.test(file);
}

// Measurement pages/components and React orchestration hooks need the full
// frontend + cognitive onboarding + real API browser lane. Keep this separate
// from frontendFile: related-tests, test-only and dependency-only shortcuts must
// not acquire these shared consumers. Engine/protocol sources stay outside.
function frontendModuleSurfaceFile(file) {
  if (typeof file !== 'string' || /[\\\x00-\x1f\x7f]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..')) return false;
  const path = file.replace(/\/__tests__\//g, '/').replace(/\.(?:test|spec)\.(tsx?)$/, '.$1');
  if (/\/(?:CognitiveRunner|api|types|registry)(?:[./-])|scoring|scorer|algorithm|finalizer|trial-timing|reference-data/i.test(path)) return false;
  return /^server-version\/frontend\/src\/modules\/(?:cognitive|composite)\/(?:[^/]+\.(?:tsx|css|scss)|(?:pages|components)\/.+\.(?:tsx|css|scss)|hooks\/use[A-Z][^/]*\.tsx?|core\/use[A-Z][^/]*\.tsx?)$/.test(path);
}

// Only existing UI-surface test modules qualify. Production source, shared
// assessment/scoring modules, config, dependency and executable test harness
// changes never enter this fast lane.
export function frontendTestFile(file) {
  return frontendFile(file) && /\.(?:test|spec)\.tsx?$/.test(file);
}
export function frontendTestOnly(files) {
  return files.some(frontendTestFile) && files.every(file=>frontendTestFile(file)||engineeringEvidenceFile(file));
}

// Compose the existing version-only dependency check with frontend source/test
// admission. This selects the full frontend lane, never frontend_affected.
export function frontendDependencyScope(entries,{base,head='HEAD'}) {
  const manifests=new Set(['server-version/frontend/package.json','server-version/frontend/package-lock.json']);
  const dependencyEntries=entries.filter(({file})=>manifests.has(file));
  if(!dependencyEntries.length||!entries.every(({file,status,oldMode,newMode})=>
    typeof file==='string'&&!/[\\\x00-\x1f\x7f]/.test(file)&&file.split('/').every(p=>p&&p!=='.'&&p!=='..')
    &&newMode==='100644'&&((status==='A'&&oldMode==='000000')||(status==='M'&&oldMode==='100644'))
    &&(manifests.has(file)||frontendFile(file)||engineeringEvidenceFile(file)
      ||file.startsWith(frontendSrc)&&/\.(?:test|spec)\.tsx?$/.test(file))))return false;
  const production=entries.map(({file})=>file).filter(file=>frontendFile(file)&&!/\.(?:test|spec)\.tsx?$/.test(file));
  if(Object.entries(acceptanceFor(production)).some(([id,selected])=>id!=='canonical_visual'&&selected))return false;
  return dependencyScope(dependencyEntries,{base,head});
}

// Local product pages use dependency-related unit tests. Shared shells, API,
// scientific runtimes and explicit media/Ops acceptance retain their own lanes.
export function frontendAffected(files,{readBaseFile,readHeadFile}={}) {
  const localPages=files.some(file=>frontendFile(file)&&!frontendTestFile(file))
    && files.every(file=>engineeringEvidenceFile(file)||(frontendFile(file)
      && /^server-version\/frontend\/src\/pages\/(?:student|teacher)\/[a-zA-Z0-9_./-]+\.tsx?$/.test(file)));
  // An empty-state/appearance adjustment on this existing report component is
  // rendering only. Imports, request paths, handlers and all non-JSX code stay
  // unchanged; this is not an exemption for the Training directory.
  const component=frontendSrc+'training/TrainingGroupReports.tsx';
  const controls=new Set(['.github/scripts/content-scope.mjs','.github/scripts/content-scope.test.mjs',
    '.github/scripts/homepage-copy-scope.mjs','.github/scripts/merge-gate.mjs',
    '.github/workflows/ci-frontend.yml','.github/workflows/ci.yml']);
  const reportDisplay=files.includes(component)&&typeof readBaseFile==='function'&&typeof readHeadFile==='function'
    &&files.every(file=>engineeringEvidenceFile(file)||controls.has(file)||file===component||file===component.replace('.tsx','.test.tsx')
      ||frontendFile(file)&&/\.(?:css|scss)$/.test(file))
    &&publicRenderBoundary(readBaseFile(component),readHeadFile(component),{sameNonRendering:true});
  return (localPages||reportDisplay)
    && !Object.entries(acceptanceFor(files)).some(([id,selected])=>id!=='canonical_visual'&&selected);
}

// Product modules can retain backend qualification without unrelated frontend
// acceptance. Shared runtimes, identity, API/DTO and scoring contracts stay out.
export function backendModuleFile(file) {
  if(typeof file!=='string'||/[\\\x00-\x1f\x7f]/.test(file)||file.split('/').some(p=>!p||p==='.'||p==='..'))return false;
  if(!file.startsWith(modules)||!/\.(?:ts|json)$/.test(file))return false;
  if(/^server-version\/backend\/src\/modules\/(?:assessment-[^/]+|reporting|cognitive|situational|auth|authorization|identity|session)\//.test(file))return false;
  if(/\/(?:runtime|scorers|algorithms|reference-data)\//.test(file))return false;
  return !/(?:^|[./-])(?:auth|authorization|identity|session|routes?|controllers?|middleware|schemas?|contracts?|types|dto|api|scoring|scorer|compiler|finalizer|runtime)(?:[./-]|$)/i.test(file.slice(modules.length));
}
export function backendModuleFilesOnly(files) {
  const evidence=file=>engineeringEvidenceFile(file)
    || /^docs\/scale-intake\/[a-zA-Z0-9_./-]+\.md$/.test(file)
    || /^docs\/evidence\/[a-zA-Z0-9_./-]+(?:\.py|\.sql\.gz|\/SHA256SUMS)$/.test(file);
  const safe=file=>typeof file==='string'&&!/[\\\x00-\x1f\x7f]/.test(file)&&file.split('/').every(p=>p&&p!=='.'&&p!=='..');
  return files.some(backendModuleFile)&&files.every(file=>safe(file)&&(backendModuleFile(file)||backendTestFile(file)||evidence(file)));
}

export function acceptanceFor(files) {
  const scopes = JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json', import.meta.url), 'utf8'));
  return Object.fromEntries(Object.entries(scopes).map(([id, { paths }]) => [id,
    files.some(file => paths.reduce((selected, pattern) =>
      posix.matchesGlob(file, pattern.startsWith('!') ? pattern.slice(1) : pattern)
        ? !pattern.startsWith('!') : selected, false))]));
}

const attachmentRoot = 'server-version/scripts/attachment-backup/';
const attachmentFiles = new Set([
  'README.md','cli.mjs','config.example.json','core.mjs','core.test.mjs',
  'cos-store.mjs','install.sh','runner.py','test_runner.py','validate-transport.mjs',
  'ci-container-smoke.py',
  ...['backup','verify','plan'].flatMap(task =>
    ['service','timer'].map(kind => 'systemd/eduk12-attachments-' + task + '.' + kind)),
].map(file => attachmentRoot + file));
const maintenanceRoutingFiles = new Set([
  'AGENTS.md','docs/ci-runner-policy.md',
  '.github/workflows/ci.yml','.github/workflows/ci-maintenance.yml',
  '.github/scripts/content-scope.mjs','.github/scripts/content-scope.test.mjs',
  '.github/scripts/merge-gate.mjs','.github/scripts/maintenance-routing.test.mjs',
  '.github/scripts/content-workflows.test.mjs',
]);
const monitorRoot = 'server-version/scripts/host-ops/';
const cleanupRoot = 'server-version/scripts/cos-cleanup/';
const cleanupFiles = new Set(['README.md','config.example.json','model.mjs','store.mjs','engine.mjs','cli.mjs',
  'runner.py','test_runner.py','cleanup.test.mjs','sdk-smoke.mjs','ci-container-smoke.py','install.sh',
  'systemd/eduk12-cos-cleanup.service','systemd/eduk12-cos-cleanup.timer',
  'recovery.mjs','recovery.py','recovery.test.mjs','test_recovery.py','recovery-smoke.mjs','ci-recovery-smoke.py',
  'systemd/eduk12-cos-recovery.service','systemd/eduk12-cos-recovery.timer'].map(file=>cleanupRoot+file));
const monitorFiles = new Set(['README.md','config.example.json','monitor.py','test_monitor.py','install.sh',
  'cdn.py','test_cdn.py','cdn-origin.cjs','cdn-origin.test.cjs','CDN.md',
  'capacity.py','test_capacity.py','cycle.py','test_cycle.py','systemd/eduk12-backup-cycle.service','systemd/eduk12-backup-cycle.timer',
  'storage.py','test_storage.py','storage-config.example.json','cos-inventory.py','cos-inventory.cjs','cos-inventory.test.mjs',
  'systemd/eduk12-storage-maintenance.service','systemd/eduk12-storage-maintenance.timer',
  'systemd/eduk12-cos-inventory.service','systemd/eduk12-cos-inventory.timer',
  'backup.py','backup-cos.cjs','backup-cos.test.mjs','backup-crypto.mjs','backup-config.example.json',
  'test_backup.py','ci-backup-smoke.py','install-backup.sh','BACKUP-AUTOMATION.md',
  'systemd/eduk12-database-backup.service','systemd/eduk12-database-backup.timer',
  'systemd/eduk12-ops-monitor.service','systemd/eduk12-ops-monitor.timer'].map(file => monitorRoot + file));
export function maintenanceFile(file) { return attachmentFiles.has(file) || monitorFiles.has(file) || cleanupFiles.has(file); }
export function maintenanceChange(files) {
  return files.length > 0 && files.some(maintenanceFile)
    && files.every(file => maintenanceFile(file) || maintenanceRoutingFiles.has(file));
}

export function classify(files) {
  const domains = [...new Set(files.map(domainFor).filter(Boolean))].sort();
  const frontend = file => frontendFile(file) || frontendModuleSurfaceFile(file);
  return {
    maintenance: maintenanceChange(files),
    documentation: files.length > 0 && files.every(documentationFile),
    content: files.length > 0 && domains.length > 0 && files.every(file => domainFor(file) || frontend(file) || engineeringEvidenceFile(file)),
    frontend: files.length > 0 && files.some(frontend) && files.every(file => domainFor(file) || frontend(file) || engineeringEvidenceFile(file)) && !files.filter(file=>!engineeringEvidenceFile(file)).every(presentationFile),
    presentation: files.some(presentationFile) && files.every(file=>presentationFile(file)||engineeringEvidenceFile(file)),
    domains,
  };
}

// Parse the full raw diff so a content-looking path never hides a deletion,
// symlink, executable file or Git object type change. Reject unexpected records.
export function parseChangedEntries(raw) {
  if (!raw) return [];
  if (!raw.endsWith('\0')) throw new Error('Malformed Git diff terminator');
  const fields = raw.slice(0, -1).split('\0');
  if (fields.length % 2) throw new Error('Malformed Git diff record');
  const entries = [];
  for (let i = 0; i < fields.length; i += 2) {
    const match = /^:([0-7]{6}) ([0-7]{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(fields[i]);
    if (!match || !fields[i + 1]) throw new Error('Unsupported Git diff record');
    entries.push({ file: fields[i + 1], oldMode: match[1], newMode: match[2], status: match[3] });
  }
  return entries;
}

function gitContent(sha,file) {
  try {const row=execFileSync('git',['ls-tree',sha,'--',file],{encoding:'utf8'});if(!/^100644 blob [a-f0-9]{40}\t/.test(row))return null;return execFileSync('git',['show',sha+':'+file],{encoding:'utf8',maxBuffer:8*1024*1024});} catch{return null;}
}

/** Shared Cognitive product changes use the existing full product checks.
 * This is not content admission: generated bytes and execution contracts remain
 * mandatory in backend cognitive:contracts/onboarding before the full gate passes. */
export {cognitiveMixedProductScope} from './cognitive-product-scope.mjs';

export function classifyChanges(entries, forceFull = false, readers = {}) {
  const result = classify(entries.map(entry => entry.file));
  const cognitiveIntake = !forceFull && readers.readHeadFile ? selectCognitiveIntake(entries,readers.readHeadFile,{readBaseFile:readers.readBaseFile}) : null;
  if(cognitiveIntake?.selected) Object.assign(result,{content:true,frontend:false,presentation:false,documentation:false,domains:['cognitive']});
  const regularChanges = entries.every(({ status, oldMode, newMode }) =>
    newMode === '100644' && ((status === 'A' && oldMode === '000000')
      || (status === 'M' && oldMode === '100644')));
  const maintenanceChanges = entries.every(({ file, status, oldMode, newMode }) => {
    const executable = [attachmentRoot + 'runner.py', attachmentRoot + 'install.sh', monitorRoot + 'install.sh', monitorRoot + 'install-backup.sh'].includes(file);
    const modes = executable ? ['100644','100755'] : ['100644'];
    return modes.includes(newMode) && ((status === 'A' && oldMode === '000000')
      || (status === 'M' && modes.includes(oldMode)));
  });
  const backendFocus=!forceFull&&regularChanges?backendApiFocus(entries,readers):null;
  const affectedFrontend=!forceFull&&regularChanges&&frontendAffected(entries.map(entry=>entry.file),readers);
  return {
    ...result,
    backend_focus:backendFocus||'full',
    maintenance: !forceFull && result.maintenance && maintenanceChanges,
    documentation: !forceFull && result.documentation && regularChanges,
    content: !forceFull && result.content && regularChanges,
    cognitive_intake_light: cognitiveIntake?.selected === true,
    cognitive_intake_plan: cognitiveIntake?.selected ? cognitiveIntake : null,
    scale_intake_light: !forceFull && result.content && regularChanges && Boolean(selectScaleIntake(entries)),
    presentation: !forceFull && result.presentation && regularChanges,
    frontend: !forceFull && (result.frontend||affectedFrontend) && regularChanges,
    frontend_affected: affectedFrontend,
    backend_modules: !forceFull && regularChanges && (Boolean(backendFocus)||backendModuleFilesOnly(entries.map(entry=>entry.file))),
    frontend_test: !forceFull && frontendTestOnly(entries.map(entry => entry.file)) && regularChanges,
  };
}

// Explain escalation using the same allowlists and metadata as admission.
export function platformReasons(entries, forceFull = false) {
  if (forceFull) return [{reason:'explicit-full-request'}];
  const selected = classifyChanges(entries);
  if (['maintenance','documentation','content','presentation','frontend','backend_modules'].some(key => selected[key])) return [];
  if (!entries.length) return [{reason:'no-changes-classified'}];
  const reasons = [];
  for (const entry of entries) {
    const {file,status,oldMode,newMode} = entry;
    const executable = [attachmentRoot+'runner.py',attachmentRoot+'install.sh',monitorRoot+'install.sh'].includes(file);
    const modes = executable ? ['100644','100755'] : ['100644'];
    if (!(modes.includes(newMode) && ((status === 'A' && oldMode === '000000')
        || (status === 'M' && modes.includes(oldMode)))))
      reasons.push({file,reason:'deletion-or-file-type-or-mode-change'});
    if (![domainFor(file),frontendFile(file),frontendModuleSurfaceFile(file),documentationFile(file),presentationFile(file),
        maintenanceFile(file),maintenanceRoutingFiles.has(file)].some(Boolean))
      reasons.push({file,reason:'outside-scoped-allowlists'});
  }
  return reasons.length ? reasons : [{reason:'mixed-scopes-require-platform'}];
}

export function changedEntries(base, head = 'HEAD') {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('A full base SHA is required');
  if (head !== 'HEAD' && !/^[a-f0-9]{40}$/.test(head)) throw new Error('A full head SHA or HEAD is required');
  // --no-renames retains both sides; NUL handles unusual filenames. Explicit
  // format/algorithm flags prevent local Git configuration changing the input.
  return parseChangedEntries(execFileSync('git', ['diff', '--no-ext-diff', '--no-textconv',
    '--no-renames', '--raw', '--abbrev=40', '-z', base, head, '--'], { encoding: 'utf8' }));
}

export function changedFiles(base, head = 'HEAD') {
  return changedEntries(base, head).map(entry => entry.file);
}

export function runnerPlan({ profile = 'hosted', scenario = 'platform' } = {}) {
  // Old repository variables and saved dispatch requests cannot restore local runners.
  if (!['hosted','speed','economy','local','balanced','hybrid'].includes(profile))
    throw new Error('Unsupported CI_RUNNER_PROFILE');
  const hosted = ['ubuntu-24.04'];
  return { runner_profile:'hosted',
    heavy_runner:hosted, light_runner:hosted, frontend_runner:hosted,
    docker_runner:hosted, codeql_runner:hosted, regression_runner:hosted,
    browser_runner:hosted, media_runner:hosted,
    visual_hosted:scenario === 'platform',
    frontend_route_reason:'GitHub-hosted Ubuntu; each job uses an isolated VM' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Keep the module itself synchronous: merge-gate imports this classifier.
  // A top-level await of the verifier would deadlock that import cycle.
  void (async()=>{
  const event = process.env.CI_EVENT;
  const full = process.env.CI_FORCE_FULL === 'true';
  const head = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const base = catalogDiffBase(process.env.CI_BASE_SHA,head,changedEntries);
  const emit = output => {
    console.log(JSON.stringify(output));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(output).map(([key,value])=>`${key}=${value}\n`).join(''));
  };
  if ((event==='push'||event==='pull_request'&&process.env.CI_PR_REPOSITORY===process.env.GITHUB_REPOSITORY)&&!full&&readEdgeScope(base)) {
    emit({...edgeConfigOutputs(),diff_base:base});
    process.exit(0);
  }
  // Admission is also checked in job.if before checkout.
  if (event === 'pull_request' && process.env.CI_PR_REPOSITORY !== process.env.GITHUB_REPOSITORY)
    throw new Error('External PRs require a separately approved isolated workflow');
  // A blank manual request must never silently select every platform job.
  if (event === 'workflow_dispatch' && process.env.CI_FULL_ACCEPTANCE !== 'true')
    throw new Error('Choose a step_probe for component CI, or explicitly set full_acceptance=true for whole-platform CI');
  const entries = event === 'workflow_dispatch' ? [] : changedEntries(base);
  const files = entries.map(entry => entry.file);
  const result = event === 'workflow_dispatch'
    ? { maintenance:false, content:false, presentation:false, frontend:false, documentation:false, domains:[] }
    : classifyChanges(entries, full, {readHeadFile:file=>gitContent('HEAD',file),readBaseFile:file=>gitContent(base,file)});
  const mixedContent=result.content && result.domains.length>1;
  const cognitiveCandidate=entries.some(e=>/^server-version\/(?:backend\/src\/modules\/cognitive\/(?:tasks|generated|content-candidates)\/|frontend\/src\/modules\/cognitive\/(?:(?:tasks|generated)\/|native-runners\.tsx$))/.test(e.file));
  const cognitiveMixed = cognitiveCandidate && !mixedContent && !result.cognitive_intake_light && cognitiveMixedProductScope(entries, file=>gitContent('HEAD',file),file=>gitContent(base,file));
  if (cognitiveMixed) Object.assign(result, {maintenance:false,content:false,presentation:false,documentation:false,frontend:false,frontend_test:false,backend_modules:false,domains:[...new Set([...result.domains,'cognitive'])]});
  if(cognitiveCandidate && !mixedContent && !result.cognitive_intake_light && !cognitiveMixed && !full && event!=='workflow_dispatch') {
    const refused=selectCognitiveIntake(entries,file=>gitContent('HEAD',file),{readBaseFile:file=>gitContent(base,file)});
    console.log(JSON.stringify({kind:'cognitive-intake-refusal',base,...refused}));
    throw Error('UNSUPPORTED_COGNITIVE_INTAKE:'+refused.reason+': explicit affected route required; no platform fallback');
  }
  const basicDependencies = !full && event !== 'workflow_dispatch'
    && dependencyScope(entries, {base});
  const mixedFrontendDependencies = !basicDependencies && !full && event !== 'workflow_dispatch'
    && frontendDependencyScope(entries,{base});
  const dependencies = basicDependencies || mixedFrontendDependencies;
  const frontendDependencies = mixedFrontendDependencies || basicDependencies && frontendDependencyFilesOnly(entries);
  const backendModules = result.backend_modules && !result.content && !result.frontend && !result.presentation && !result.documentation;
  const frontendTest = result.frontend_test === true;
  const frontend = result.frontend === true && !frontendTest;
  const affectedFrontend = frontend && result.frontend_affected === true;
  const releaseTools = !result.documentation && !dependencies && !full && event !== 'workflow_dispatch' && toolingOnly(entries);
  const imageBuild = releaseTools && imageBuildOnly(entries);
  const copy = !full && event !== 'workflow_dispatch' ? homepageCopyPlan(entries,base,head) : null;
  const catalogDiscovery=event!=='workflow_dispatch'&&!full&&catalogDiscoveryScope(entries,{readHeadFile:file=>gitContent('HEAD',file),readBaseFile:file=>gitContent(base,file)});
  const productRead=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
  const product=event!=='workflow_dispatch'&&!full&&cognitiveProductPlan(changedEntries(base),base,head,productRead(head),productRead(base));
  if(product){emit(cognitiveProductOutputs(product));process.exit(0);}
  const backendUnit = event === 'pull_request' && !full && unitOnly(entries);
  const scenario = catalogDiscovery ? 'catalog-discovery' : cognitiveMixed ? 'platform' : copy ? 'homepage-copy' : releaseTools ? 'release-tooling' : backendUnit ? 'backend-unit' : dependencies ? 'dependencies' : backendModules ? 'backend' : result.maintenance ? 'maintenance' : result.documentation ? 'documentation' : result.content ? (frontend ? 'content-frontend' : 'content')
    : result.presentation ? 'presentation' : frontendTest ? 'frontend-test' : frontend ? 'frontend' : 'platform';
  // Local pages are covered by related tests and one frontend build. The broad
  // student/** visual inventory does not require every platform browser fixture.
  const selectedAcceptance = acceptanceFor(files);
  const acceptance = catalogDiscovery || result.presentation || result.cognitive_intake_light || affectedFrontend || backendModules || copy || frontendTest || backendUnit || releaseTools ? Object.fromEntries(Object.keys(selectedAcceptance).map(key => [key, false])) : selectedAcceptance;
  if (scenario === 'platform' || (event === 'workflow_dispatch' && process.env.CI_FULL_ACCEPTANCE === 'true'))
    for (const key of Object.keys(acceptance)) acceptance[key] = true;
  const plan = runnerPlan({ profile:process.env.CI_RUNNER_PROFILE || 'hosted', scenario });
  const mediaSelection = ['media2','video_core','media7','situational_video','situational_branching'].filter(key => acceptance[key]);
  const uiRequired = acceptance.app_shell || acceptance.canonical_visual;
  const frontendBuild = dependencies || frontend && !affectedFrontend || scenario === 'platform' || uiRequired || mediaSelection.length > 0;
  const codeql = catalogDiscovery || Boolean(copy?.sast) || releaseTools || dependencies || backendModules || scenario === 'platform' || frontend
    || (result.content && contentCodeqlRequired(entries,declarationReaders(base)));
  const release = event === 'workflow_dispatch' || full ? null : applicationPlan(base, head);
  const output = { authoring_polish:catalogDiscovery&&authoringPolishScope(entries), student_discovery:catalogDiscovery&&studentDiscoveryScope(entries,{readHeadFile:file=>gitContent('HEAD',file),readBaseFile:file=>gitContent(base,file)}), backend_focus:result.backend_focus||'full', bundle_family:catalogDiscovery&&bundleFamilyScope(entries), bundle_runtime:catalogDiscovery&&bundleRuntimeScope(entries), homepage_copy_plan:JSON.stringify(copy), application_route:copy ? 'homepage-copy' : backendUnit ? 'backend-unit' : release && release.route !== 'C' ? release.route : 'legacy', release_plan:JSON.stringify(release), maintenance: result.maintenance, content: result.content, presentation: result.presentation, frontend, frontend_test:frontendTest,
    documentation: result.documentation, diff_base:base, codeql, scenario, image_build:imageBuild, frontend_affected:affectedFrontend||catalogDiscovery,
    dependencies_frontend_only:frontendDependencies,
    frontend_build:catalogDiscovery?false:frontendBuild, ui_required:uiRequired,
    media_selection:JSON.stringify(mediaSelection), media_groups:JSON.stringify(mediaSelection.length ? mediaPlan(mediaSelection) : []),
    cognitive_intake_light:result.cognitive_intake_light === true,cognitive_intake_plan:JSON.stringify(result.cognitive_intake_plan || null),
    scale_intake_light: result.scale_intake_light === true, scale: result.domains.includes('scale'), cognitive: result.domains.includes('cognitive'),
    situational: result.domains.includes('situational'), bundle: result.domains.includes('bundle'),
    ...acceptance, ...Object.fromEntries(Object.entries(plan).map(([key,value]) =>
      [key, Array.isArray(value) ? JSON.stringify(value) : value])) };
  Object.assign(output,{frontend_retest:false,frontend_retest_file:'',
    frontend_retest_source_run:'',frontend_retest_source_sha:'',
    frontend_retest_gate_digest:'',frontend_retest_report_digest:'',
    frontend_retest_case:''});
  if(event==='pull_request' && scenario==='platform' && output.application_route==='legacy'
      && !full && process.env.CI_IS_DRAFT!=='true') {
    try {
      const {verifiedFrontendRetest}=await import('./ci-frontend-retest.mjs');
      const evidence=await verifiedFrontendRetest({
        token:process.env.GH_TOKEN,repo:process.env.GITHUB_REPOSITORY,
        pr:Number(process.env.CI_PR_NUMBER),branch:process.env.CI_HEAD_REF,
        prHead:process.env.CI_SOURCE_HEAD,baseSha:base,
        currentRunId:Number(process.env.GITHUB_RUN_ID)
      });
      if(evidence){
        // The GitHub source report and ALL other required source jobs were
        // independently checked. Only the repaired Vitest file runs on HEAD.
        const retestPlan=runnerPlan({profile:'hosted',scenario:'frontend-test'});
        Object.assign(output,{
          scenario:'frontend-test',frontend_test:true,frontend:false,content:false,
          presentation:false,documentation:false,maintenance:false,codeql:false,
          frontend_build:false,ui_required:false,frontend_affected:false,
          media_selection:'[]',media_groups:'[]',...Object.fromEntries(
            Object.keys(acceptance).map(key=>[key,false])),
          ...retestPlan,
          frontend_retest:true,frontend_retest_file:evidence.testFile,
          frontend_retest_source_run:String(evidence.runId),
          frontend_retest_source_sha:evidence.sourceSha,
          frontend_retest_gate_digest:evidence.gateDigest,
          frontend_retest_report_digest:evidence.reportDigest,
          frontend_retest_case:evidence.failedCase
        });
        console.log(JSON.stringify({kind:'verified-single-frontend-retest',
          sourceRun:evidence.runId,file:evidence.testFile}));
      }
    }catch(error){
      console.warn('Frontend retest rejected; normal complete CI retained: '+
        String(error?.message||error).slice(0,350));
    }
  }
  console.log(JSON.stringify({ ...output, base, validationClosure: result.cognitive_intake_light ? 'selected-cognitive-tasks' : 'all-bundles', platformReasons: catalogDiscovery || dependencies ? [] : platformReasons(entries, full || event === 'workflow_dispatch') }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
  })().catch(error=>{console.error(error);process.exitCode=1});
}
