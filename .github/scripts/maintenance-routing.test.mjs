import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyChanges, maintenanceFile, acceptanceFor } from './content-scope.mjs';
import { requiredChecks, failedChecks } from './merge-gate.mjs';
const root = 'server-version/scripts/attachment-backup/';
const entry = (file, mode='100644') => ({file,status:'A',oldMode:'000000',newMode:mode});
function outputs() {
  return {...Object.fromEntries(Object.keys(acceptanceFor([])).map(key=>[key,'false'])),
    maintenance:'true',content:'false',presentation:'false',frontend:'false',documentation:'false',
    codeql:'false',scenario:'maintenance',runner_profile:'hosted',frontend_build:'false',
    ui_required:'false',visual_hosted:'false',media_selection:'[]',media_groups:'[]'};
}
test('known standalone attachment files and their coordinated routing update select lightweight maintenance',()=>{
  const changes=['core.mjs','config.example.json','systemd/eduk12-attachments-backup.timer'].map(f=>entry(root+f));
  changes.push(entry(root+'runner.py','100755'),entry(root+'install.sh','100755'));
  for(const policy of ['AGENTS.md','docs/ci-runner-policy.md','.github/workflows/ci.yml',
    '.github/workflows/ci-maintenance.yml','.github/scripts/content-scope.mjs',
    '.github/scripts/content-scope.test.mjs','.github/scripts/merge-gate.mjs',
    '.github/scripts/maintenance-routing.test.mjs']) changes.push(entry(policy));
  assert.equal(classifyChanges(changes).maintenance,true);
  assert.equal(classifyChanges(changes,true).maintenance,false);
});
test('business code, dependencies, DB, Docker, old recovery workflow and unknown scripts cannot use attachment shortcut',()=>{
  for(const file of ['server-version/backend/src/routes/assets.ts','server-version/backend/package-lock.json',
    'server-version/frontend/package.json','server-version/backend/prisma/schema.prisma',
    'server-version/backend/Dockerfile','server-version/docker-compose.yml',
    '.github/workflows/ops-prelaunch.yml',root+'delete-executor.mjs',root+'nested/core.mjs',
    root+'../backup/restore-db.mjs',root+'core.mjs\n']) {
    assert.equal(classifyChanges([entry(root+'core.mjs'),entry(file)]).maintenance,false,file);
  }
  assert.equal(classifyChanges([entry('.github/workflows/ci.yml')]).maintenance,false);
  assert.equal(classifyChanges([]).maintenance,false);
});
test('deletions, symlinks and arbitrary executable modes are not maintenance updates',()=>{
  const safe=entry(root+'core.mjs');
  for(const bad of [{...safe,status:'D',oldMode:'100644',newMode:'000000'},
    {...safe,newMode:'120000'},{...safe,newMode:'100755'},{...safe,status:'T'}])
    assert.equal(classifyChanges([bad]).maintenance,false);
  assert.equal(maintenanceFile(root+'core.mjs'),true);
});
test('draft and ready attachment PRs require the actual maintenance job; skip/failure/cancel/missing cannot pass',()=>{
  for(const draft of [true,false]) {
    const needs={scope:{result:'success',outputs:outputs()},maintenance:{result:'success'}};
    assert.deepEqual(requiredChecks(needs,draft),['scope','maintenance']);
    assert.deepEqual(failedChecks(needs,draft),[]);
    for(const result of ['failure','skipped','cancelled',undefined])
      assert.ok(failedChecks({...needs,maintenance:{result}},draft).includes('maintenance'));
    for(const patch of [{maintenance:undefined},{maintenance:'TRUE'},{scenario:'platform'},
      {frontend:'true'},{ops:'true'},{codeql:'true'},{media_selection:'["video_core"]'}])
      assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...outputs(),...patch}}},draft).includes('scope'));
  }
});
const source=n=>readFileSync(new URL('../workflows/'+n+'.yml',import.meta.url),'utf8');
const job=(s,n)=>s.split('  '+n+':\n')[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0]??'';
test('normal scheduler runs maintenance for pure attachment changes and keeps application checks for mixed changes',()=>{
  const ci=source('ci'),lane=source('ci-maintenance');
  assert.match(job(ci,'maintenance'),/outputs\.maintenance == 'true'/);
  assert.match(job(ci,'merge-gate'),/needs: \[scope, maintenance,/);
  for(const name of ['pr-light-backend','pr-light-frontend','post-merge-smoke','backend',
    'backend-regression','frontend','docker','miniprogram'])
    assert.match(job(ci,name),/outputs\.maintenance != 'true'/,name);
  assert.match(lane,/node-version: '24\.21\.0'/);
  for(const file of ['core.test.mjs','cleanup-restore-container.test.mjs','test_*.py','ci-container-smoke.py'])
    assert.ok(lane.includes(file),file);
  assert.doesNotMatch(lane,/npm ci|DATABASE_URL|COS_SECRET|BACKUP_ENCRYPTION_KEY/);
  for(const name of ['ci-backend','ci-frontend'])
    assert.match(source(name),/npm audit --audit-level=high/);
});

import { execFileSync } from 'node:child_process';
import { platformReasons } from './content-scope.mjs';
test('manual full CI is opt-in; a blank, false or malformed flag fails before selecting heavy jobs',()=>{
  const script=new URL('./content-scope.mjs',import.meta.url).pathname;
  for(const value of ['', 'false', 'TRUE', '1']) {
    assert.throws(()=>execFileSync(process.execPath,[script],{env:{...process.env,
      CI_EVENT:'workflow_dispatch',CI_FULL_ACCEPTANCE:value,CI_FORCE_FULL:'',
      GITHUB_OUTPUT:''},encoding:'utf8',stdio:'pipe'}),/Choose a step_probe/);
  }
  const ci=source('ci');
  assert.match(ci,/full_acceptance:\n        type: boolean\n        default: false/);
  assert.match(job(ci,'scope'),/inputs\.step_probe == 'none'/);
});
test('known observe-only host monitoring files use maintenance, including executable installer',()=>{
  const host='server-version/scripts/host-ops/';
  for(const file of ['config.example.json','monitor.py','test_monitor.py','README.md',
    'systemd/eduk12-ops-monitor.service','systemd/eduk12-ops-monitor.timer'])
    assert.equal(classifyChanges([entry(host+file)]).maintenance,true,file);
  assert.equal(classifyChanges([entry(host+'install.sh','100755')]).maintenance,true);
  for(const file of [host+'recovery.py','server-version/backend/src/config/database.ts',
    'server-version/scripts/backup/restore-db.mjs'])
    assert.equal(classifyChanges([entry(host+'config.example.json'),entry(file)]).maintenance,false,file);
  const lane=source('ci-maintenance');
  assert.match(lane,/bash -n server-version\/scripts\/host-ops\/install\.sh/);
  assert.match(lane,/systemd-analyze verify[^\n]+host-ops\/systemd/);
});
test('platform escalation reports excluded paths and metadata changes without hiding full-force',()=>{
  const core='server-version/backend/src/modules/scale/scale-scoring.ts';
  assert.deepEqual(platformReasons([entry(root+'config.example.json')]),[]);
  assert.deepEqual(platformReasons([entry(core)]),[{file:core,reason:'outside-scoped-allowlists'}]);
  const deleted={...entry(root+'core.mjs'),status:'D',oldMode:'100644',newMode:'000000'};
  assert.deepEqual(platformReasons([deleted]),[{file:deleted.file,reason:'deletion-or-file-type-or-mode-change'}]);
  assert.deepEqual(platformReasons([entry(root+'core.mjs')],true),[{reason:'explicit-full-request'}]);
});

test('isolated host backup wrappers use maintenance with actual restore evidence; old restore edits stay outside',()=>{
  const host='server-version/scripts/host-ops/';
  const files=['backup.py','backup-cos.cjs','backup-cos.test.mjs','backup-crypto.mjs','backup-config.example.json',
    'test_backup.py','ci-backup-smoke.py','install-backup.sh','BACKUP-AUTOMATION.md',
    'systemd/eduk12-database-backup.service','systemd/eduk12-database-backup.timer'];
  for(const file of files) assert.equal(classifyChanges([entry(host+file)]).maintenance,true,file);
  assert.equal(classifyChanges([entry(host+'install-backup.sh','100755')]).maintenance,true);
  for(const unknown of [host+'delete-cos.py',host+'restore-production.py','server-version/scripts/backup/backup-db.mjs'])
    assert.equal(classifyChanges([entry(host+'backup.py'),entry(unknown)]).maintenance,false,unknown);
  assert.match(source('ci-maintenance'),/ci-backup-smoke[.]py/);
  assert.match(source('ci-maintenance'),/node --test server-version\/scripts\/host-ops\/backup-cos[.]test[.]mjs/);
});
test('explicit protected COS cleanup files select maintenance, unknown executors and business mixtures do not',()=>{
  const cleanup='server-version/scripts/cos-cleanup/';
  for(const file of ['README.md','config.example.json','model.mjs','store.mjs','engine.mjs','cli.mjs','runner.py',
    'test_runner.py','cleanup.test.mjs','sdk-smoke.mjs','ci-container-smoke.py','install.sh','systemd/eduk12-cos-cleanup.service','systemd/eduk12-cos-cleanup.timer']) {
    assert.equal(classifyChanges([entry(cleanup+file)]).maintenance,true,file);
    assert.deepEqual(platformReasons([entry(cleanup+file)]),[]);
  }
  for(const file of [cleanup+'delete-all.mjs','server-version/backend/src/utils/cos.ts','server-version/scripts/backup/restore-db.mjs'])
    assert.equal(classifyChanges([entry(cleanup+'engine.mjs'),entry(file)]).maintenance,false,file);
  const lane=source('ci-maintenance');assert.match(lane,/cos-cleanup\/cleanup[.]test[.]mjs/);
  assert.match(lane,/cos-cleanup -p 'test_\*\.py'/);
});

test('joint recovery exact files stay in maintenance; unknown proof writers cannot bypass platform scope',()=>{
 const base='server-version/scripts/cos-cleanup/';
 for(const file of ['recovery.mjs','recovery.py','recovery.test.mjs','test_recovery.py','recovery-smoke.mjs','ci-recovery-smoke.py','systemd/eduk12-cos-recovery.service','systemd/eduk12-cos-recovery.timer'])assert.equal(classifyChanges([entry(base+file)]).maintenance,true,file);
 for(const file of ['fake-proof.py','recover-production.mjs','nested/recovery.py'])assert.equal(classifyChanges([entry(base+'recovery.py'),entry(base+file)]).maintenance,false,file);
 assert.match(source('ci-maintenance'),/cos-cleanup\/ci-recovery-smoke[.]py/);
 assert.match(source('ci-maintenance'),/cos-cleanup\/recovery[.]test[.]mjs/);
});
