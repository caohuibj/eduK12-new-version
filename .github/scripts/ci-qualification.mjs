// Conservative CI risk classification and cross-run evidence validation.
// An unrecognized or mixed executable change is never granted a lightweight route.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const LEVELS=Object.freeze(['L0','L1','L2','L3','L4']);
export const CHECKS=Object.freeze(['backend-unit','backend-regression','frontend','browser','docker','codeql']);

const normal=e=>e&&typeof e.file==='string'&&e.newMode==='100644'
  &&((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644'))
  &&!e.file.split('/').some(x=>!x||x==='.'||x==='..')
  &&!/[\\\u0000-\u001f\u007f]/.test(e.file);
export const backendUnitFile=p=>/^server-version\/backend\/src\/__tests__\/situational\/[a-zA-Z0-9._/-]+\.test\.ts$/.test(p)
  &&!/(?:postgres|integration|database|\.e2e\.|fixture)/i.test(p);
const frontendUnitFile=p=>/^server-version\/frontend\/src\/[a-zA-Z0-9._/-]+\.(?:test|spec)\.tsx?$/.test(p);
const localPresentation=p=>/^server-version\/frontend\/src\/[a-zA-Z0-9._/-]+\.(?:css|scss)$/.test(p)
  &&!/(?:^|\/)(?:global|app|index|reset|tokens|theme)\.(?:css|scss)$/i.test(p);
const documentation=p=>p==='README.md'||p==='CONTRIBUTING.md'
  || /^docs\/(?:contributing|guides)\/[a-zA-Z0-9._/-]+\.md$/.test(p);

export function classifyQualification(entries){
  assert(Array.isArray(entries)&&entries.length>0,'PR must contain a real changed-file inventory');
  const files=entries.map(e=>e?.file);
  assert.equal(new Set(files).size,files.length,'Duplicate changed file');
  if(entries.some(e=>!normal(e)))return {level:'L4',route:'platform',reason:'unsafe-file-mode-or-deletion'};
  if(files.every(documentation))return {level:'L0',route:'documentation',reason:'docs-only'};
  if(files.every(localPresentation))return {level:'L1',route:'presentation',reason:'local-style-only'};
  if(files.every(backendUnitFile))return {level:'L2',route:'backend-unit',reason:'isolated-unit-tests-only'};
  if(files.every(frontendUnitFile))return {level:'L2',route:'frontend-test',reason:'frontend-tests-only'};
  if(files.every(p=>/^server-version\/backend\/src\/modules\/[a-zA-Z0-9_-]+\//.test(p)
    &&!/(?:auth|identity|session|security|runtime|scor|contract|final|schema|compiler|migration|policy)/i.test(p)))
    return {level:'L3',route:'backend',reason:'module-behavior-change'};
  return {level:'L4',route:'platform',reason:'mixed-or-shared-change'};
}

export const unitOnly=entries=>Array.isArray(entries)&&entries.length>0
  &&classifyQualification(entries).route==='backend-unit';

// The closure intentionally includes more than an individual test's imports:
// CI control code, shared scripts, fixtures and dependencies must all be unchanged.
const ROOTS=Object.freeze({
  'backend-regression':['.github/','server-version/backend/','server-version/scripts/','server-version/e2e/'],
  'backend-unit':['.github/','server-version/backend/','server-version/scripts/','server-version/e2e/'],
  'frontend':['.github/','server-version/frontend/','server-version/backend/','server-version/scripts/'],
  'browser':['.github/','server-version/'],
  'docker':['.github/','server-version/'],
  'codeql':['.github/','server-version/']
});
export function closureDigest(check,tree){
  const roots=ROOTS[check];
  assert(roots,'Unknown CI qualification check');
  assert(Array.isArray(tree)&&tree.length>0,'Complete git tree required');
  const selected=tree.filter(e=>roots.some(r=>e.path.startsWith(r))).sort((a,b)=>a.path.localeCompare(b.path,'en'));
  assert(selected.length>0,'Missing qualification inputs');
  let previous='';
  const hash=createHash('sha256');
  for(const e of selected){
    assert(typeof e.path==='string'&&e.path>previous&&!/[\r\n\u0000]/.test(e.path),'Invalid or duplicate git tree entry');
    assert(e.mode==='100644'||e.mode==='100755','Unsupported input mode');
    assert(e.type==='blob'&&/^[a-f0-9]{40}$/.test(e.sha),'Missing exact input blob');
    previous=e.path;
    hash.update(e.path+'\u0000'+e.mode+'\u0000'+e.sha+'\n','utf8');
  }
  // Closure policy changes invalidate every stored checkpoint.
  hash.update('\u0000ci-qualification-v1:'+check+'\n');
  return hash.digest('hex');
}

// A proof is never authorization by itself. The caller MUST independently fetch
// the original official run, job and artifact, and verify the archive's bytes.
// No source SHA rewrite, green-status copying, or acceptance of cancelled runs.
export function verifyHistoricalSuccess({proof,run,job,artifact,archiveBytes,current,sourceTree,currentTree,now=Date.now()}){
  assert(proof?.schema===1&&proof.outcome==='success','Only finalized passing checkpoints qualify');
  assert(CHECKS.includes(proof.check),'Unsupported checkpoint lane');
  for(const key of ['repository','pr','baseSha','workflowPath','workflowDigest'])
    assert.equal(proof[key],current[key],'Checkpoint context changed: '+key);
  assert(/^[a-f0-9]{40}$/.test(proof.sourceSha)&&/^[a-f0-9]{40}$/.test(current.headSha),'Invalid source/head');
  assert.equal(run.id,proof.runId);assert.equal(run.head_sha,proof.sourceSha);
  assert.equal(run.event,'pull_request');assert.equal(run.status,'completed');
  // The overall run may fail because another unrelated job failed. Only this
  // individual completed successful job and its immutable artifact can qualify.
  assert(['success','failure'].includes(run.conclusion),'Cancelled or incomplete source run');
  assert(Array.isArray(run.pull_requests)&&run.pull_requests.some(p=>p.number===current.pr),'Foreign PR run');
  assert.equal(run.repository?.full_name,current.repository,'Foreign source run');
  assert.equal(job.id,proof.jobId);assert.equal(job.run_id,proof.runId);
  assert.equal(job.head_sha,proof.sourceSha,'Source job SHA differs');
  assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
  assert.equal(job.name,proof.jobName);
  assert.equal(artifact.id,proof.artifactId);assert.equal(artifact.workflow_run?.id,proof.runId);
  assert.equal(artifact.expired,false);
  assert(archiveBytes instanceof Uint8Array && archiveBytes.length>0,'Original official artifact bytes required');
  const archiveDigest=createHash('sha256').update(archiveBytes).digest('hex');
  assert.equal(artifact.digest,'sha256:'+archiveDigest,'Original archive differs from GitHub official artifact');
  assert.equal(proof.archiveDigest,archiveDigest,'Checkpoint digest differs from official artifact');
  const completed=Date.parse(job.completed_at);
  assert(Number.isFinite(completed)&&now>=completed&&now-completed<=72*3600*1000,'Checkpoint expired');
  const source=closureDigest(proof.check,sourceTree),target=closureDigest(proof.check,currentTree);
  assert.equal(proof.inputDigest,source,'Historical input inventory was not authenticated');
  assert.equal(source,target,'Current checked inputs differ from original run');
  assert(current.prHeadHistory?.includes(proof.sourceSha),'Checkpoint source is not in this PR history');
  return Object.freeze({outcome:'REUSED_VERIFIED',check:proof.check,headSha:current.headSha,
    sourceSha:proof.sourceSha,runId:proof.runId,inputDigest:target});
}
