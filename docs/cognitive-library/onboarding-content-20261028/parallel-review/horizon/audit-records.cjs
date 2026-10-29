const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../..'),backend=path.join(root,'server-version/backend');
require(path.join(backend,'node_modules/tsx/dist/cjs/index.cjs'));
const task=path.join(backend,'src/modules/cognitive/content-candidates/horizon-exploration');
const {createHorizonSnapshot}=require(path.join(task,'package.ts'));
const {horizonPlan,otherSide}=require(path.join(task,'protocol.ts'));
const {scoreHorizon,horizonEnvelope}=require(path.join(task,'scorer.ts'));
const {projectHorizonReport}=require(path.join(task,'report.ts'));
const {HorizonCapture}=require(path.join(root,'server-version/frontend/src/modules/cognitive/tasks/horizon-exploration/capture.ts'));
const {projectNativeContentReport}=require(path.join(backend,'src/modules/cognitive/content-candidates/native-registry/public-report.ts'));
const {isNativePublicReportSnapshot}=require(path.join(root,'server-version/frontend/src/modules/cognitive/core/native-public-report.ts'));
const session=createHorizonSnapshot('experience'),randomSeed='independent-horizon-review-20261028',config=session.config,plans=horizonPlan(config,randomSeed);
function record(plan,start,steps=plan.totalSteps,finish=true){
 const cap=new HorizonCapture(config,plan,start);
 for(let step=0;step<steps;step++){
  const side=step<4?plan.forced[step]:plan.lessSampledSide?(plan.freeChoices===1?plan.lessSampledSide:otherSide(plan.lessSampledSide)):'left';
  // An actual press at the ready time is a real zero RT, never a missing response.
  const atMs=cap.raw.state.readyAtMs;
  cap.input({kind:'down',atMs,side,input:'keyboard',token:'key:'+(side==='left'?'ArrowLeft':'ArrowRight'),key:side==='left'?'ArrowLeft':'ArrowRight',repeat:false});
  cap.input({kind:'up',atMs:atMs+1,side,input:'keyboard',token:'key:'+(side==='left'?'ArrowLeft':'ArrowRight'),key:side==='left'?'ArrowLeft':'ArrowRight',repeat:false});
  if(step<steps-1||finish)cap.tick(atMs+config.feedbackMs);
 }
 if(!cap.done)cap.interrupt('participant-ended',cap.raw.state.choices.at(-1)?.atMs+1||start);
 return horizonEnvelope(cap.raw);
}
const shortIndex=plans.findIndex(p=>p.information==='unequal'&&p.freeChoices===1),longIndex=plans.findIndex(p=>p.information==='unequal'&&p.freeChoices===6),prefixLength=Math.max(shortIndex,longIndex)+1;
let now=100;
const prefix=plans.slice(0,prefixLength).map((plan,index)=>{const raw=record(plan,now,index===prefixLength-1?5:plan.totalSteps,index!==prefixLength-1);now=raw.endedAtPerfMs+1;return raw});
const inputs={empty:{session,config,randomSeed,trials:[]},beforeFirst:{session,config,randomSeed,trials:[record(plans[0],100,4,false)]},afterFirst:{session,config,randomSeed,trials:[record(plans[0],100,5,false)]},signedComparison:{session,config,randomSeed,trials:prefix}};
const reports={},checks=[];
for(const [name,input] of Object.entries(inputs)){
 const report=projectHorizonReport(scoreHorizon(input));reports[name]=report;
 const choices=input.trials.flatMap(e=>e.payload.state.choices),firsts=input.trials.filter(e=>e.payload.state.choices.length>=5);
 assert.equal(report.validFirstChoices,firsts.length);assert.equal(report.totalChoices,choices.length);assert.equal(report.totalReward,choices.reduce((n,c)=>n+c.reward,0));
 assert.ok(choices.every(c=>c.rtMs===0));
 for(const row of Object.values(report.groups).flatMap(g=>g.rows)){
  const history=input.trials[row.gameIndex].payload.state.choices.slice(0,4),left=history.filter(c=>c.side==='left'),right=history.filter(c=>c.side==='right');
  assert.equal(row.observedMeanLeft,left.reduce((n,c)=>n+c.reward,0)/left.length);assert.equal(row.observedMeanRight,right.reduce((n,c)=>n+c.reward,0)/right.length);assert.equal(row.observedMeanDifference,row.observedMeanLeft-row.observedMeanRight);
 }
 assert.equal(report.groups.equalShort.lessSampledChoices,null);assert.equal(report.groups.equalLong.lessSampledChoices,null);
 checks.push({name,state:report.state,received:report.received,completed:report.completed,validFirstChoices:report.validFirstChoices,totalChoices:report.totalChoices,zeroRTResponses:choices.length,totalReward:report.totalReward,longMinusShortLessSampledRate:report.longMinusShortLessSampledRate});
}
assert.equal(reports.empty.state,'invalid');assert.equal(reports.empty.longMinusShortLessSampledRate,null);assert.equal(reports.beforeFirst.state,'invalid');assert.equal(reports.beforeFirst.validFirstChoices,0);assert.equal(reports.afterFirst.state,'limited');assert.equal(reports.afterFirst.completed,0);assert.equal(reports.afterFirst.validFirstChoices,1);
assert.equal(reports.signedComparison.longMinusShortLessSampledRate,-1);assert.equal(reports.signedComparison.groups.unequalLong.lessSampledChoices,0);assert.ok(reports.signedComparison.groups.unequalLong.validFirstChoices>0);
const score=scoreHorizon(inputs.empty),binding={testType:session.testType,engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,configVersion:session.configVersion,configHash:session.configHash,protocolSignature:session.protocolSignature,reportDefinitionVersion:config.reportDefinitionVersion,presentationVersion:config.presentationVersion,profile:config.profile,score};
const normal=projectNativeContentReport(binding),unknown=projectNativeContentReport({...binding,presentationVersion:'next'});
const identityFinding={status:'reproduced-baseline-gap-awaiting-parent-shared-fix',normalAccepted:isNativePublicReportSnapshot(normal),unknownOuterPresentationAccepted:isNativePublicReportSnapshot(unknown),outerPresentationVersion:unknown.presentationVersion,innerTaskPresentationVersion:unknown.report.presentationVersion,expectation:'Horizon 0.1.0 task presentation must remain frozen; arbitrary next must not be accepted as its saved native presentation. Parent will resolve generic participantPresentation versus native task presentation semantics in shared code.'};
assert.equal(identityFinding.unknownOuterPresentationAccepted,true);
fs.writeFileSync(path.join(__dirname,'representative-inputs.json'),JSON.stringify({synthetic:true,sessionJourney:false,note:'Four independent representative scorer inputs; not a claim that a stopped session may resume. Prefix uses original actual plans, capture/reducer, and authoritative scorer/public projector.',inputs},null,2));
fs.writeFileSync(path.join(__dirname,'public-reports.json'),JSON.stringify(reports,null,2));
const sourceFiles=[...fs.readdirSync(task).filter(n=>n.endsWith('.ts')).map(n=>path.join(task,n)),...fs.readdirSync(path.join(root,'server-version/frontend/src/modules/cognitive/tasks/horizon-exploration')).filter(n=>/\.(ts|tsx|css)$/.test(n)).map(n=>path.join(root,'server-version/frontend/src/modules/cognitive/tasks/horizon-exploration',n)),path.join(backend,'src/modules/cognitive/content-candidates/native-registry/public-report.ts'),path.join(root,'server-version/frontend/src/modules/cognitive/core/native-public-report.ts')];
const sources=Object.fromEntries(sourceFiles.map(f=>[path.relative(root,f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const receipt={synthetic:true,baseline:'fdc72a9739df7cafc2b238ae45f7d976b3c985f2',command:'node docs/cognitive-library/onboarding-content-20261028/parallel-review/horizon/audit-records.cjs',checks,identityFinding,configHash:session.configHash,protocolSignature:session.protocolSignature,sourceSHA256:sources};
fs.writeFileSync(path.join(__dirname,'audit-receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({checks,identityFinding},null,2));
