import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mediaPlan } from './ci-media-plan.mjs';
import { dependencyScope } from './dependency-scope.mjs';

const modules = 'server-version/backend/src/modules/';
const frontendSrc = 'server-version/frontend/src/';

// Only established content surfaces qualify. New engines, scorers, runners,
// shared helpers, dependencies and CI changes require the full gate.
export function domainFor(file) {
  if (typeof file !== 'string' || file.split('/').some(part => !part || part === '..' || part === '.')
      || /[\\\x00-\x1f\x7f]/.test(file)) return null;
  if (new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/(manifest|evidence-map|rules|report|scientific|publication|context)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/packages/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+/fixtures/(valid|missing|invalid|not-applicable)\\.json$`).test(file)
      || new RegExp(`^${modules}assessment-bundle/ci-fixtures/[a-zA-Z0-9_-]+/\\d+\\.\\d+\\.\\d+\\.json$`).test(file)
      || file === `${modules}assessment-bundle/generated/packages.json`) return 'bundle';
  if (new RegExp(`^${modules}scale/instruments/[^/]+/[^/]+/`).test(file)
      || file === `${modules}scale/instruments/learning-motivation-wave1-data.json`
      || file === `${modules}scale/onboarding/instruments.generated.ts`
      || file.startsWith('server-version/backend/src/__tests__/scale/instruments/')
      || file.startsWith('docs/scale-instruments/')) return 'scale';
  if (new RegExp(`^${modules}situational/instruments/[^/]+/[^/]+/(instrument|publication|scientific)\\.json$`).test(file)
      || file === `${modules}situational/onboarding/instruments.generated.ts`) return 'situational';
  if (new RegExp(`^${modules}cognitive/tasks/[^/]+/(seeds|participant-presentation|governance|scientific)\\.ts$`).test(file)) return 'cognitive';
  return null;
}

// Ordinary engineering documentation only; scientific/publication/runbook
// documents keep their existing domain or platform validation.
export function documentationFile(file) {
  return typeof file === 'string' && !/[\\\x00-\x1f\x7f]/.test(file)
    && !file.split('/').some(part => !part || part === '.' || part === '..')
    && (['README.md', 'CONTRIBUTING.md', 'docs/ci-runner-policy.md'].includes(file)
      || /^docs\/(development|contributing)\/[a-zA-Z0-9_./-]+\.md$/.test(file));
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
  return {
    maintenance: maintenanceChange(files),
    documentation: files.length > 0 && files.every(documentationFile),
    content: files.length > 0 && domains.length > 0 && files.every(file => domainFor(file) || frontendFile(file)),
    frontend: files.length > 0 && files.some(frontendFile) && files.every(file => domainFor(file) || frontendFile(file)) && !files.every(presentationFile),
    presentation: files.length > 0 && files.every(presentationFile),
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

export function classifyChanges(entries, forceFull = false) {
  const result = classify(entries.map(entry => entry.file));
  const regularChanges = entries.every(({ status, oldMode, newMode }) =>
    newMode === '100644' && ((status === 'A' && oldMode === '000000')
      || (status === 'M' && oldMode === '100644')));
  const maintenanceChanges = entries.every(({ file, status, oldMode, newMode }) => {
    const executable = [attachmentRoot + 'runner.py', attachmentRoot + 'install.sh', monitorRoot + 'install.sh', monitorRoot + 'install-backup.sh'].includes(file);
    const modes = executable ? ['100644','100755'] : ['100644'];
    return modes.includes(newMode) && ((status === 'A' && oldMode === '000000')
      || (status === 'M' && modes.includes(oldMode)));
  });
  return {
    ...result,
    maintenance: !forceFull && result.maintenance && maintenanceChanges,
    documentation: !forceFull && result.documentation && regularChanges,
    content: !forceFull && result.content && regularChanges,
    presentation: !forceFull && result.presentation && regularChanges,
    frontend: !forceFull && result.frontend && regularChanges,
  };
}

// Explain escalation using the same allowlists and metadata as admission.
export function platformReasons(entries, forceFull = false) {
  if (forceFull) return [{reason:'explicit-full-request'}];
  const selected = classifyChanges(entries);
  if (['maintenance','documentation','content','presentation','frontend'].some(key => selected[key])) return [];
  if (!entries.length) return [{reason:'no-changes-classified'}];
  const reasons = [];
  for (const entry of entries) {
    const {file,status,oldMode,newMode} = entry;
    const executable = [attachmentRoot+'runner.py',attachmentRoot+'install.sh',monitorRoot+'install.sh'].includes(file);
    const modes = executable ? ['100644','100755'] : ['100644'];
    if (!(modes.includes(newMode) && ((status === 'A' && oldMode === '000000')
        || (status === 'M' && modes.includes(oldMode)))))
      reasons.push({file,reason:'deletion-or-file-type-or-mode-change'});
    if (![domainFor(file),frontendFile(file),documentationFile(file),presentationFile(file),
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

// Hosted-only policy. Legacy profile arguments remain accepted by reusable/manual
// callers, but cannot select self-managed machines or weaken test coverage.
export function runnerPlan({ profile = 'hosted', scenario = 'platform' } = {}) {
  if (!['hosted', 'speed', 'economy', 'local', 'balanced', 'hybrid'].includes(profile))
    throw new Error('Unsupported CI_RUNNER_PROFILE');
  const hosted = ['ubuntu-24.04'];
  return {
    runner_profile:'hosted',
    heavy_runner:hosted, light_runner:hosted, frontend_runner:hosted,
    docker_runner:hosted, codeql_runner:hosted, regression_runner:hosted,
    browser_runner:hosted, media_runner:hosted,
    visual_hosted:scenario === 'platform',
    frontend_route_reason:'Public repository uses standard GitHub-hosted Ubuntu runners',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.CI_EVENT;
  const base = process.env.CI_BASE_SHA;
  // Retain fork admission policy until a separately reviewed public-PR trust model is approved.
  if (event === 'pull_request' && process.env.CI_PR_REPOSITORY !== process.env.GITHUB_REPOSITORY)
    throw new Error('External fork PRs require a separately approved isolated workflow');
  // A blank manual request must never silently select every platform job.
  if (event === 'workflow_dispatch' && process.env.CI_FULL_ACCEPTANCE !== 'true')
    throw new Error('Choose a step_probe for component CI, or explicitly set full_acceptance=true for whole-platform CI');
  const entries = event === 'workflow_dispatch' ? [] : changedEntries(base);
  const files = entries.map(entry => entry.file);
  const result = event === 'workflow_dispatch'
    ? { maintenance:false, content:false, presentation:false, frontend:false, documentation:false, domains:[] }
    : classifyChanges(entries, process.env.CI_FORCE_FULL === 'true');
  const dependencies = process.env.CI_FORCE_FULL !== 'true' && event !== 'workflow_dispatch'
    && dependencyScope(entries, {base});
  const frontend = result.frontend === true;
  const scenario = dependencies ? 'dependencies' : result.maintenance ? 'maintenance' : result.documentation ? 'documentation' : result.content ? (frontend ? 'content-frontend' : 'content')
    : result.presentation ? 'presentation' : frontend ? 'frontend' : 'platform';
  const acceptance = acceptanceFor(files);
  if (scenario === 'platform' || (event === 'workflow_dispatch' && process.env.CI_FULL_ACCEPTANCE === 'true'))
    for (const key of Object.keys(acceptance)) acceptance[key] = true;
  const plan = runnerPlan({ profile:process.env.CI_RUNNER_PROFILE || 'hosted', scenario });
  const mediaSelection = ['media2','video_core','media7','situational_video','situational_branching'].filter(key => acceptance[key]);
  const uiRequired = acceptance.app_shell || acceptance.canonical_visual;
  const frontendBuild = dependencies || frontend || scenario === 'platform' || uiRequired || mediaSelection.length > 0;
  const codeql = dependencies || scenario === 'platform' || frontend
    || (result.content && files.some(file => /\.[cm]?[jt]sx?$/.test(file)));
  const output = { maintenance: result.maintenance, content: result.content, presentation: result.presentation, frontend,
    documentation: result.documentation, codeql, scenario,
    frontend_build:frontendBuild, ui_required:uiRequired,
    media_selection:JSON.stringify(mediaSelection), media_groups:JSON.stringify(mediaSelection.length ? mediaPlan(mediaSelection) : []),
    scale: result.domains.includes('scale'), cognitive: result.domains.includes('cognitive'),
    situational: result.domains.includes('situational'), bundle: result.domains.includes('bundle'),
    ...acceptance, ...Object.fromEntries(Object.entries(plan).map(([key,value]) =>
      [key, Array.isArray(value) ? JSON.stringify(value) : value])) };
  console.log(JSON.stringify({ ...output, base, validationClosure: 'all-bundles', platformReasons: dependencies ? [] : platformReasons(entries, process.env.CI_FORCE_FULL === 'true' || event === 'workflow_dispatch') }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
}
