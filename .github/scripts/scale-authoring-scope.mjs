import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const BASE='d3b51288a66843168480af99fe451914a76a020f';
export const REF='refs/heads/ci/scale-authoring-feedback-20261021';
export function validate(entries, manifest, context) {
  assert.equal(context.event,'push'); assert.equal(context.ref,REF);
  assert.equal(manifest.base,BASE); assert.equal(manifest.scope,'scale-authoring-feedback-20261021');
  const expected=manifest.files;
  assert(entries.length>84,'Frozen product and control files required');
  assert.equal(new Set(entries.map(x=>x.file)).size,entries.length);
  assert.deepEqual(entries.map(x=>x.file).sort(),Object.keys(expected).sort(),'Unknown, missing or renamed path');
  for(const entry of entries) {
    assert(['A','M'].includes(entry.status),'Deletion/rename forbidden');
    assert.equal(entry.afterMode,'100644','Executable/symlink forbidden');
    assert(['000000','100644'].includes(entry.beforeMode));
    const bound=expected[entry.file];
    assert.equal(entry.before,bound.before,entry.file+' base drift');
    // Manifest is the reviewed plan, not a self-authenticating execution receipt.
    if(entry.file!=='.github/scripts/scale-authoring-bindings.json') assert.equal(entry.after,bound.after,entry.file+' source drift');
  }
  return {status:'PASS',scope:manifest.scope,base:BASE,head:context.head,paths:entries.length,mergeQualified:false,productionAuthorized:false};
}
export function reportCheck(report,{allowFiltered=false,minimum=1}={}) {
  assert.equal(report.success,true,'Reporter did not succeed');
  assert.equal(report.numFailedTests,0); assert.equal(report.numFailedTestSuites,0);
  assert(report.numPassedTests>=minimum,'No required assertions executed');
  if(!allowFiltered) assert.equal(report.numPendingTests||0,0,'Selected tests skipped');
  return {passed:report.numPassedTests,filtered:report.numPendingTests||0};
}
export function browserCheck(report,head) {
  assert.equal(report.status,'PASS'); assert.equal(report.sourceCommit,head);
  const required=['training-editor-native','training-stable-item-operations','training-quality-roundtrip','training-published','training-final-report-image','survey-editor-native','survey-quality-roundtrip','survey-published','survey-final-report-image','survey-raw-quality-export','training-report-image-denies-other-user','survey-report-image-denies-missing-proof','desktop-mobile-layout'];
  assert.deepEqual([...report.checks].sort(),required.sort());
  assert.equal(report.blockedExternalRequests,0);assert.deepEqual(report.browserErrors,[]);
  assert.equal(report.screenshots.length,12);assert.equal(new Set(report.screenshots.map(x=>x.file)).size,12);
  for(const width of [390,768,1440]) assert.equal(report.screenshots.filter(x=>x.width===width).length,4);
  for(const shot of report.screenshots) assert(/^[a-z0-9-]+\.png$/.test(shot.file));
  const layoutMatrix=['training-editor','training-report','survey-editor','survey-report'].flatMap(name=>[390,768,1440].map(width=>name+':'+width)).sort();
  assert.equal(report.layoutChecks.length,12);
  assert.deepEqual(report.layoutChecks.map(x=>x.name+':'+x.width).sort(),layoutMatrix);
  for(const item of report.layoutChecks) assert.equal(item.overflow,false,'Layout overflow or missing observation');
  assert.equal(report.accessibility.length,4);
  const surfaces=['training-editor','training-report','survey-editor','survey-report'];
  assert.deepEqual(report.accessibility.map(x=>x.name).sort(),[...surfaces].sort());
  assert.deepEqual(report.screenshots.map(x=>x.file).sort(),surfaces.flatMap(name=>[390,768,1440].map(width=>name+'-'+width+'.png')).sort());
  assert.deepEqual(report.participantAnswers,[{name:'training',answerCount:3,matchesFinalSnapshot:true},{name:'survey',answerCount:3,matchesFinalSnapshot:true}]);
  assert.equal(report.export.format,'RAW_WAVE');assert.equal(report.export.rowCount,3);assert.equal(report.export.downloadedFiles,3);
  assert.deepEqual(report.imageAuthorization.map(x=>x.name).sort(),['survey-missing-proof','training-other-user']);
  for(const item of report.imageAuthorization){assert.equal(item.positiveStatus,200);assert.equal(item.deniedStatus,404);assert.equal(item.deniedImage,false);assert(Number.isInteger(item.deniedLength)&&item.deniedLength>=0);if(item.name==='survey-missing-proof')assert.equal(item.deniedLength,0)}
  for(const check of report.accessibility){assert(check.passes>0);assert.deepEqual(check.violations,[])}
  return {status:'PASS',checks:required.length,screenshots:12,accessibility:4};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const command=process.argv[2];
  if(command==='scope') {
    const raw=execFileSync('git',['diff','--raw','--no-abbrev','--no-renames',BASE,'HEAD'],{encoding:'utf8'}).trim();
    const entries=raw.split('\n').filter(Boolean).map(line=>{const [header,file]=line.split('\t'); const [beforeMode,afterMode,before,after,status]=header.slice(1).split(' ');return {beforeMode,afterMode,before,after,status,file};});
    const result=validate(entries,JSON.parse(readFileSync('.github/scripts/scale-authoring-bindings.json')),{event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()});
    mkdirSync('scale-authoring-evidence',{recursive:true}); writeFileSync('scale-authoring-evidence/scope.json',JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
  } else if(command==='report') console.log(JSON.stringify(reportCheck(JSON.parse(readFileSync(process.argv[3])),{allowFiltered:process.argv[4]==='filtered'})));
  else if(command==='browser-report') {const report=JSON.parse(readFileSync('scale-authoring-evidence/browser/result.json'));console.log(JSON.stringify(browserCheck(report,process.env.GITHUB_SHA)));for(const shot of report.screenshots)assert(statSync('scale-authoring-evidence/browser/'+shot.file).size>0)}
  else throw new Error('Unknown operation');
}
