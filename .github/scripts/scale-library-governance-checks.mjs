// Runs only the frozen affected inventory, inside the original Debian builder.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const component=process.argv[2];assert(['backend','frontend','postgres'].includes(component));
const root=process.env.GITHUB_WORKSPACE;
assert(root);const plan=JSON.parse(readFileSync(resolve(root,'.github/scripts/scale-library-governance-bindings.json')));
assert.equal(plan.frozen,true,'An unfinished inventory cannot run');
const files=plan.tests[component];assert(Array.isArray(files)&&files.length>0);
assert.equal(new Set(files).size,files.length);
assert(files.every(f=>/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(f)));
const evidence=process.env.GOVERNANCE_EVIDENCE;assert(evidence);mkdirSync(evidence,{recursive:true});
const run=args=>execFileSync(process.execPath,args,{stdio:'inherit',timeout:300000});
if(component==='frontend'){
 run(['node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit']);
 assert(plan.frontendLint.length);run(['node_modules/eslint/bin/eslint.js',...plan.frontendLint]);
}
const report=resolve(evidence,component+'-tests.json');
run(['node_modules/vitest/vitest.mjs','run',...files,'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+report]);
const r=JSON.parse(readFileSync(report));assert.equal(r.success,true);assert(r.numPassedTests>0);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);
assert.deepEqual(r.testResults.map(s=>resolve(s.name)).sort(),files.map(f=>resolve(f)).sort());
for(const suite of r.testResults){assert(suite.assertionResults.length);assert(suite.assertionResults.every(a=>a.status==='passed'));}
