import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
export function browserCheck(report,head,runId) {
  assert.equal(report.status,'PASS'); assert.equal(report.sourceCommit,head);
  const source=report.journeySources;assert(source);
  assert.equal(source.survey.mode,'executed');assert.equal(source.survey.sourceHead,head);assert(Number.isInteger(source.survey.runId)&&source.survey.runId>0);
  if(runId!==undefined)assert.equal(source.survey.runId,runId);
  if(source.training.mode==='reused') {
    assert.equal(source.training.runId,39571934879);assert.equal(source.training.sourceHead,'7daa3ad8cb0fb9597303a2ef3e1c28c3209dd548');
    assert.equal(source.training.reportSha256,'d7511d708d7b12dc643f02061b526da9b9bb61292ddc5172a7a1300bc95ad3e3');assert.equal(source.training.originalStatus,'FAIL');
    assert.deepEqual(source.training.screenshotHashes,{"training-editor-1440.png":"a1f620b475d1af6b7bb6f7219caedcf7224e57c27178727d72ed4247aa874c79","training-editor-390.png":"fcc5cf3e25f9f3fed748156a6dd289e27822872850e6275c4cc65d90c1937057","training-editor-768.png":"1baa0b62047a51aec1882c9bbd78d171b308b815832a8715e92088735dfb2e5c","training-report-1440.png":"a7400392843a26c0d574d5d6970498bef087f1d08d5fc8b3478b43b4308df108","training-report-390.png":"62e73fa19b7d4c7cf30d1bc6f900d4dc3b03d913885854aa3e8a229dda1ffd73","training-report-768.png":"03fc1e967aedf3952b7e973ec0ba01787ce9cc3453ced7b94d24c8847ff0664e"});
  } else assert.deepEqual(source.training,{mode:'executed',runId:source.survey.runId,sourceHead:head});

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
  assert.deepEqual(report.surveyImageDelivery.rendered,{"sourceKind":"blob","complete":true,"naturalWidth":16,"naturalHeight":16,"byteLength":103,"contentType":"image/png","signature":[137,80,78,71,13,10,26,10],"sha256":"f152348704ab15cbdb0c57d769e0541c42100dccf86572485b8b912b248d33b3"});
  assert(report.surveyImageDelivery.responses.length>0&&report.surveyImageDelivery.responses.length<=10);
  for(const response of report.surveyImageDelivery.responses){assert.equal(response.method,'POST');assert.equal(response.status,200);assert.match(response.contentType,/^image\/png(?:;|$)/);assert(response.contentLength===null||typeof response.contentLength==='string'&&/^\d+$/.test(response.contentLength))}
  assert.deepEqual(report.measurementPublication,{status:'PUBLISHED',currentRevisionBound:true,frozenReleaseMatches:true});
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
  else if(command==='browser-report') {const report=JSON.parse(readFileSync('scale-authoring-evidence/browser/result.json'));console.log(JSON.stringify(browserCheck(report,process.env.GITHUB_SHA,Number(process.env.GITHUB_RUN_ID))));for(const shot of report.screenshots){const file='scale-authoring-evidence/browser/'+shot.file;assert(statSync(file).size>0);const hash=report.journeySources.training.screenshotHashes?.[shot.file];if(hash)assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash)}}
  else throw new Error('Unknown operation');
}
