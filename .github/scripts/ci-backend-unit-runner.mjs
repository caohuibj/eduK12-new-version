// Fail-closed execution of only the backend unit test files changed by this PR.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {changedEntries} from './content-scope.mjs';
import {unitOnly} from './ci-qualification.mjs';
const base=process.env.CI_BASE_SHA;
assert.match(base||'',/^[a-f0-9]{40}$/,'Exact PR base SHA required');
const entries=changedEntries(base);
assert(unitOnly(entries),'Refusing unrelated runtime, integration, config, fixture or deleted files');
const files=entries.map(e=>e.file.slice('server-version/backend/'.length)).sort();
assert(files.length>0);
console.log('Incremental backend unit tests: '+JSON.stringify(files));
const dir=resolve('server-version/backend');
const report=resolve(process.env.RUNNER_TEMP||'/tmp','ci-backend-unit-report.json');
const result=spawnSync(process.execPath,
 [resolve(dir,'node_modules/vitest/vitest.mjs'),'run',...files,'--no-file-parallelism',
  '--reporter=default','--reporter=json','--outputFile='+report],
 {cwd:dir,stdio:'inherit',env:process.env});
if(result.error)throw result.error;
assert.equal(result.status,0,'Changed backend unit tests failed');
const evidence=JSON.parse(readFileSync(report,'utf8'));
assert.equal(evidence.success,true);
assert.equal(evidence.numFailedTests,0);
assert(evidence.numPassedTests>0,'No unit tests executed: reject skipped-only coverage');
console.log(JSON.stringify({route:'backend-unit',executed:files.length,passed:evidence.numPassedTests,failed:0}));
