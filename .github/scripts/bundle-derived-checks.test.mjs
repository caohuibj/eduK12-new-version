import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertTargetedEntries,sourceFiles,sastConfig} from './bundle-derived-checks.mjs';
const source=sourceFiles.find(p=>p.endsWith('/onboarding/derived-report.ts'));
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
test('rejects unrelated application, database, dependency and non-regular changes',()=>{
 assert.doesNotThrow(()=>assertTargetedEntries([entry(source)]));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/controllers/authController.ts'])assert.throws(()=>assertTargetedEntries([entry(source),entry(file)]));
 assert.throws(()=>assertTargetedEntries([{...entry(source),newMode:'120000'}]));
 assert.throws(()=>assertTargetedEntries([{...entry(source),status:'R'}]));
 assert.throws(()=>assertTargetedEntries([entry('.github/workflows/ci.yml')]));
});
test('keeps SAST on every changed production file and the executable controls',()=>{
 const paths=sastConfig({productionFiles:[source]}).paths;
 assert(paths.includes(source));assert(paths.includes('.github/scripts/bundle-derived-checks.mjs'));
 assert(paths.includes('.github/scripts/bundle-derived-checks.test.mjs'));
});
test('the new probe is opt-in and does not replace legacy qualification or introduce DB services',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const block=workflow.slice(workflow.indexOf('  probe-bundle-derived:'),workflow.indexOf('  probe-backend:'));
 assert.match(block,/github.event_name == 'workflow_dispatch'/);assert.match(block,/inputs.step_probe == 'bundle-derived'/);
 assert.match(block,/inputs.full_acceptance != true/);assert.match(block,/ci-bundle-derived.yml/);
 const targeted=readFileSync(new URL('../workflows/ci-bundle-derived.yml',import.meta.url),'utf8');
 for(const item of ['derived-core.test.ts','scale-start-context.test.ts','derived-saved-read.test.ts','derived-adapters.test.ts','types backend','types frontend','github/codeql-action/analyze@v3'])assert(targeted.includes(item));
 assert(!/migrate deploy|prisma db|seed|npm run build|services:|full_acceptance: true/.test(targeted));
 assert.match(targeted,/upload: never/);
});
