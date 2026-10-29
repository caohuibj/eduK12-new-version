import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const cognitiveIntakeToolingInputs = Object.freeze([
  '.github/scripts/cognitive-intake-scope.mjs', '.github/scripts/cognitive-intake-scope.test.mjs',
  '.github/scripts/cognitive-intake-check.mjs', '.github/scripts/cognitive-intake-check.test.mjs',
  '.github/workflows/scale-onboarding-boundary.yml',
  'server-version/backend/src/scripts/cognitive-onboarding-check.ts',
  'server-version/scripts/cognitive/onboarding-selection.cjs',
  'server-version/scripts/cognitive/onboarding-selection.test.cjs',
  'server-version/scripts/cognitive/acceptance.cjs',
]);
export const cognitiveIntakeToolingChanged = files => files.some(file => cognitiveIntakeToolingInputs.includes(file));
export const cognitiveTaskRoot = 'server-version/backend/src/modules/cognitive/tasks/';
const frontRoot = 'server-version/frontend/src/modules/cognitive/tasks/';
const generated = new Set(['execution.ts','catalog.ts','seeds.ts','presentation.ts','scientific.ts','identities.json'].map(f => 'server-version/backend/src/modules/cognitive/generated/'+f));
const generatedRunner = 'server-version/frontend/src/modules/cognitive/generated/runners.ts';
const safe = file => typeof file === 'string' && !/[\\\x00-\x1f\x7f]/.test(file) && file.split('/').every(p => p && p !== '.' && p !== '..');
const data = new Set(['seeds.ts','participant-presentation.ts','governance.ts','scientific.ts']);
const readJSON = (read, file) => { const text = read?.(file); return text == null ? null : JSON.parse(text); };

/** Pure, dependency-free planning. AST and generated-byte verification belong to the executor. */
export function selectCognitiveIntake(entries, readHeadFile, {readBaseFile} = {}) {
  const files = [], modes = new Map(), browsers = new Set();
  const result = (selected, status, reason) => ({selected,status,reason,tasks:[...modes.keys()].sort(),mode:[...modes.values()].every(m=>m==='data')?'data':'task',taskModes:Object.fromEntries([...modes].sort()),requiresBrowser:browsers.size>0,browserTasks:[...browsers].sort(),files:[...files].sort()});
  if (!Array.isArray(entries) || !entries.length) return result(false,'NOT_SELECTED','empty-diff');
  let generatedChanged = false, runnerChanged = false;
  for (const e of entries) {
    if (!e || !safe(e.file) || files.includes(e.file)) return result(false,'NOT_SELECTED','invalid-or-duplicate-path');
    files.push(e.file);
    if (e.newMode !== '100644' || !(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644')) return result(false,'NOT_SELECTED','nonregular-or-deleted-change');
    if (generated.has(e.file)) { generatedChanged=true; continue; }
    if (e.file===generatedRunner) { runnerChanged=true; continue; }
    const backend = e.file.startsWith(cognitiveTaskRoot), frontend = e.file.startsWith(frontRoot);
    const suffix = backend ? e.file.slice(cognitiveTaskRoot.length) : frontend ? e.file.slice(frontRoot.length) : '';
    const [task,...rest] = suffix.split('/');
    if (!suffix || !/^[a-zA-Z0-9_-]+$/.test(task) || !rest.length || task==='shared') return result(false,'NOT_SELECTED','shared-or-mixed-input');
    const mode = backend && rest.length===1 && data.has(rest[0]) ? 'data' : 'task';
    if (!modes.has(task) || mode==='task') modes.set(task,mode);
    if (frontend || /\.(?:png|webp|avif|svg|jpg|jpeg|gif|woff2?|mp3|wav|mp4)$/i.test(e.file)) browsers.add(task);
  }
  if (!modes.size) return result(false,'NOT_SELECTED','generated-without-task');
  try {
    for (const task of modes.keys()) {
      const file = cognitiveTaskRoot+task+'/task-package.json';
      const current = readJSON(readHeadFile,file), previous = readJSON(readBaseFile,file);
      if (!current || current.schemaVersion!==1 || current.task!==task || !Array.isArray(current.identities) || !current.identities.length) return result(false,'NOT_SELECTED','missing-task-package');
      const suites = current.acceptance?.frontendSuites;
      if (!Array.isArray(suites) || !suites.length || new Set(suites).size!==suites.length || suites.some(s=>!safe(s)||!s.startsWith('src/modules/cognitive/')||!/\.test\.tsx?$/.test(s))) return result(false,'NOT_SELECTED','invalid-acceptance-suites');
      const oldSuites = previous?.acceptance?.frontendSuites || [];
      if (oldSuites.some(s=>!suites.includes(s)) || suites.some(s=>!oldSuites.includes(s)&&!s.startsWith('src/modules/cognitive/tasks/'+task+'/'))) return result(false,'NOT_SELECTED','acceptance-suite-substitution');
      const engines = pack => [...new Set((pack?.identities||[]).map(id=>id.engineVersion))].sort();
      if (!previous || JSON.stringify(engines(current))!==JSON.stringify(engines(previous)) || JSON.stringify(current.frontend)!==JSON.stringify(previous.frontend)) browsers.add(task);
    }
  } catch { return result(false,'NOT_SELECTED','unreadable-task-package'); }
  if (generatedChanged) for (const task of modes.keys()) modes.set(task,'task');
  if (runnerChanged) for (const task of modes.keys()) browsers.add(task);
  return result(true,browsers.size?'UNSUPPORTED_SELECTED_BROWSER':'SELECTED_COGNITIVE_INTAKE',browsers.size?'selected-real-browser-contract-unavailable':'isolated-task-inputs');
}

export function parseCognitiveIntakeRawDiff(raw) {
  if (raw==='') return [];
  assert.ok(raw.endsWith('\0'),'Malformed raw diff');
  const fields=raw.slice(0,-1).split('\0'); assert.equal(fields.length%2,0,'Malformed raw diff');
  const result=[];
  for(let i=0;i<fields.length;i+=2) {
    const match=/^:([0-7]{6}) ([0-7]{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(fields[i]);
    assert.ok(match && fields[i+1],'Unsupported raw diff');
    result.push({file:fields[i+1],oldMode:match[1],newMode:match[2],status:match[3]});
  }
  return result;
}
export function readCognitiveIntakeDiff(base,head,{cwd=process.cwd()}={}) {
  for(const sha of [base,head]) assert.match(sha||'',/^[a-f0-9]{40}$/,'Exact base and checkout required');
  assert.notEqual(base,head,'Empty candidate');
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(git('rev-parse','HEAD').trim(),head,'Checkout identity mismatch');
  assert.equal(git('diff','--no-ext-diff','--no-textconv','--ignore-submodules=none','--name-only','HEAD','--').trim(),'','Dirty tracked worktree/index');
  const entries=parseCognitiveIntakeRawDiff(git('diff','--no-ext-diff','--no-textconv','--ignore-submodules=none','--raw','--abbrev=40','--no-renames','-z',base,head));
  const read = sha => file => {try {assert.match(git('ls-tree',sha,'--',file),/^100644 blob [a-f0-9]{40}\t/); return git('show',sha+':'+file);} catch {return null;}};
  return {base,head,entries,...selectCognitiveIntake(entries,read(head),{readBaseFile:read(base)})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const p=readCognitiveIntakeDiff(process.env.COGNITIVE_INTAKE_BASE_SHA,process.env.COGNITIVE_INTAKE_HEAD_SHA); console.log(JSON.stringify(p)); assert.ok(p.selected,p.reason); assert.ok(!p.requiresBrowser,p.status);}
  catch(e) {console.error(e.message);process.exitCode=1;}
}
