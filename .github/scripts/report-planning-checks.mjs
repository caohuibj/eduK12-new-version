import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {reportPlanningPlan} from './report-planning-scope.mjs';
import {changedEntries} from './content-scope.mjs';
import {pathToFileURL} from 'node:url';
export const defaultFiles=['src/__tests__/integration/educationLibraryPersonalReport.postgres.integration.test.ts','src/__tests__/integration/educationPrivateScaleReport.postgres.integration.test.ts','src/__tests__/integration/educationLibraryObserver.postgres.integration.test.ts'];
export function validatePgReport(r,files,count){
 assert.equal(r.success,true);assert.equal(r.numTotalTests,count);assert.equal(r.numPassedTests,count);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0);assert.equal(r.testResults.length,files.length);
 const names=r.testResults.map(s=>files.find(f=>s.name===f||s.name.endsWith('/'+f)));assert(!names.includes(undefined));assert.deepEqual([...names].sort(),[...files].sort());
 let assertions=0;for(const suite of r.testResults){assert.equal(suite.status,'passed');assert(suite.assertionResults.length);for(const a of suite.assertionResults){assert.equal(a.status,'passed');assertions++;}}assert.equal(assertions,count);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),plan=JSON.parse(process.env.PLAN||'null');
 assert(plan&&plan.head===head&&plan.postMerge===false);assert.deepEqual(reportPlanningPlan(changedEntries(plan.base,head),plan.base,head),plan);
 mkdirSync('report-planning-evidence',{recursive:true});
 if(process.argv[2]==='source')writeFileSync('report-planning-evidence/source.json',JSON.stringify({head,tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID,plan},null,2));
 else if(process.argv[2]==='reports'){
  for(const[file,files,count]of [['pg16-default.json',defaultFiles,9],['pg16-compact.json',[defaultFiles[1]],4]])validatePgReport(JSON.parse(readFileSync('report-planning-evidence/'+file,'utf8')),files,count);
  writeFileSync('report-planning-evidence/database-verification.json',JSON.stringify({head,runId:process.env.GITHUB_RUN_ID,status:'PASSED',postgres:'16.15',defaultTests:9,compactTests:4,localUnitEvidence:'development-only; not rerun or claimed CI execution',scope:'selected PG16 consumers only; build/scan/CodeQL require their actual job outcomes'},null,2));
 }else throw Error('Unsupported report-planning phase');
}
