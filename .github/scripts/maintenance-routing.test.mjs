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
    codeql:'false',scenario:'maintenance',runner_profile:'speed',frontend_build:'false',
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
