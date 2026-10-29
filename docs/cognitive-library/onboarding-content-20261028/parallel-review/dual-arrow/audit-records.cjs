const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../..'),backend=path.join(root,'server-version/backend'),front=path.join(root,'server-version/frontend');
require(path.join(backend,'node_modules/tsx/dist/cjs/index.cjs'));
const task=path.join(backend,'src/modules/cognitive/content-candidates/dual-arrow'),{createDualSnapshot}=require(path.join(task,'package.ts')),{dualPlan,requiredDual,dualFeedbackMs}=require(path.join(task,'protocol.ts')),{scoreDual,dualEnvelope}=require(path.join(task,'scorer.ts')),{projectDualReport}=require(path.join(task,'report.ts')),{DualCapture}=require(path.join(front,'src/modules/cognitive/tasks/dual-arrow/capture.ts'));
const session=createDualSnapshot('experience'),config=session.config,other=d=>d==='left'?'right':'left';
function seedFor(mode){for(let n=0;n<30;n++){const seed='independent-dual-review-'+n;if(dualPlan(config,seed)[0].mode===mode)return seed}throw Error('No representative seed')}
const dualSeed=seedFor('dual'),singleSeed=seedFor('blue');
function press(cap,channel,direction,atMs,token='pointer:'+channel,kind='down',repeat=false){cap.input({kind,atMs,channel,direction,token,input:'touch',key:null,repeat,primary:channel==='blue'})}
function end(cap,complete=true){if(complete)cap.tick(cap.raw.state.feedbackAtMs+dualFeedbackMs(cap.raw.state,cap.raw.plan,config));else cap.interrupt('blur',cap.raw.events.at(-1)?.atMs+1||cap.raw.startedAtPerfMs);return dualEnvelope(cap.raw)}
function one(seed,mode){const plan=dualPlan(config,seed)[0],cap=new DualCapture(config,plan,100),onset=100+plan.fixationMs;
 if(mode==='noise'){
  press(cap,'blue',plan.blue,101,'pointer:early');cap.tick(onset);press(cap,'red',plan.red,onset,'pointer:early');press(cap,'blue',plan.blue,onset+1,'pointer:early','up');
  press(cap,'blue',other(plan.blue),onset+10);press(cap,'blue',other(plan.blue),onset+11,'pointer:blue','up');press(cap,'blue',plan.blue,onset+20,'pointer:correction');press(cap,'blue',plan.blue,onset+21,'pointer:correction','up');
  for(let i=0;i<3;i++)press(cap,'blue',plan.blue,onset+22+i,'pointer:repeat','down',true);press(cap,'red',plan.red,onset+100);return end(cap);
 }
 cap.tick(onset);
 if(mode==='late'){press(cap,'blue',plan.blue,onset+plan.deadlineMs);return end(cap)}
 if(mode==='inactive'){press(cap,'red',other(plan.red),onset);press(cap,'blue',plan.blue,onset);return end(cap)}
 press(cap,'blue',plan.blue,onset);
 if(mode==='closed')press(cap,'red',plan.red,onset+10);
 return end(cap,false);
}
const inputs={};
for(const [name,seed,mode] of [['firstResponseNoise',dualSeed,'noise'],['atDeadlineMissing',dualSeed,'late'],['inactiveSingle',singleSeed,'inactive'],['unclosedInterruption',dualSeed,'unclosed'],['closedInterruption',dualSeed,'closed']])inputs[name]={session,config,randomSeed:seed,trials:[one(seed,mode)]};
const plan=dualPlan(config,dualSeed),prefixLength=Math.max(...['blue','red','dual'].map(mode=>plan.findIndex(p=>p.mode===mode)))+1;let start=100;
const prefix=plan.slice(0,prefixLength).map((p,index)=>{const cap=new DualCapture(config,p,start),onset=start+p.fixationMs;cap.tick(onset);
 for(const channel of ['blue','red']){if(!requiredDual(p.mode,channel)||index===0&&channel==='red')continue;const rt=p.mode==='dual'?(channel==='blue'?0:700):(channel==='blue'?300:200);press(cap,channel,index===0?other(p[channel]):p[channel],onset+rt)}
 if(index===0){press(cap,'blue',p.blue,onset+1,'pointer:blue-correction');cap.tick(onset+p.deadlineMs)}const e=end(cap);start=e.endedAtPerfMs+1;return e});
inputs.signedPrefix={session,config,randomSeed:dualSeed,trials:prefix};
const reports={},checks=[];const median=x=>{if(!x.length)return null;const a=[...x].sort((a,b)=>a-b);return(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2};
for(const [name,input] of Object.entries(inputs)){
 const report=projectDualReport(scoreDual(input));reports[name]=report;
 const expected={blueSingle:[],redSingle:[],blueDual:[],redDual:[]};let valid=0,both=0,dual=0;
 for(const envelope of input.trials){const raw=envelope.payload,s=raw.state,p=raw.plan;if(s.stimulusAtMs===null||s.feedbackAtMs===null)continue;valid++;
  if(p.mode==='dual'){dual++;if(s.responses.blue.choice===p.blue&&s.responses.red.choice===p.red)both++}
  for(const channel of ['blue','red']){if(!requiredDual(p.mode,channel))continue;expected[channel+(p.mode==='dual'?'Dual':'Single')].push({answered:s.responses[channel].choice!==null,correct:s.responses[channel].choice===p[channel],rt:s.responses[channel].atMs===null?null:s.responses[channel].atMs-s.stimulusAtMs})}
 }
 assert.equal(report.valid,valid);assert.equal(report.dualTrials,dual);assert.equal(report.bothCorrectDual,both);
 for(const [key,rows] of Object.entries(expected)){const g=report.groups[key];assert.equal(g.presentedRequired,rows.length);assert.equal(g.answered,rows.filter(r=>r.answered).length);assert.equal(g.correct,rows.filter(r=>r.correct).length);assert.equal(g.missed,rows.filter(r=>!r.answered).length);assert.equal(g.medianCorrectMs,median(rows.filter(r=>r.correct).map(r=>r.rt)))}
 checks.push({name,state:report.state,received:report.received,valid:report.valid,groups:report.groups,differences:report.differences,firstIgnored:input.trials[0].payload.state.ignored,firstIgnoredRepeatCount:input.trials[0].payload.ignoredRepeatCount});
}
assert.equal(reports.firstResponseNoise.groups.blueDual.correct,0);assert.equal(reports.firstResponseNoise.groups.redDual.correct,1);assert.equal(reports.firstResponseNoise.groups.blueDual.medianCorrectMs,null);assert.equal(inputs.firstResponseNoise.trials[0].payload.ignoredRepeatCount,3);
assert.equal(reports.atDeadlineMissing.groups.blueDual.missed,1);assert.equal(reports.atDeadlineMissing.groups.blueDual.medianCorrectMs,null);assert.equal(reports.inactiveSingle.groups.blueSingle.medianCorrectMs,0);assert.equal(reports.inactiveSingle.groups.redSingle.presentedRequired,0);
assert.equal(reports.unclosedInterruption.state,'invalid');assert.equal(reports.unclosedInterruption.valid,0);assert.equal(reports.closedInterruption.state,'limited');assert.equal(reports.closedInterruption.valid,1);
assert.deepEqual(reports.signedPrefix.differences,{blueLatencyMs:-300,redLatencyMs:500,blueAccuracy:-0.09999999999999998,redAccuracy:-0.09999999999999998});assert.equal(reports.signedPrefix.groups.blueDual.medianCorrectMs,0);
fs.writeFileSync(path.join(__dirname,'representative-inputs.json'),JSON.stringify({synthetic:true,sessionJourney:false,note:'Independent scorer fixtures using actual frozen plans/capture/envelopes; not permission to resume an interrupted formal session.',inputs},null,2));
fs.writeFileSync(path.join(__dirname,'public-reports.json'),JSON.stringify(reports,null,2));
const files=[...fs.readdirSync(task).filter(f=>f.endsWith('.ts')).map(f=>path.join(task,f)),...fs.readdirSync(path.join(front,'src/modules/cognitive/tasks/dual-arrow')).filter(f=>/\.(ts|tsx|css)$/.test(f)).map(f=>path.join(front,'src/modules/cognitive/tasks/dual-arrow',f)),__filename];
fs.writeFileSync(path.join(__dirname,'audit-receipt.json'),JSON.stringify({node:process.version,baseline:'a67f425269283d8281379fdf8234f9fd6b0acebc',configHash:session.configHash,protocolSignature:session.protocolSignature,checks,sourceSHA256:Object.fromEntries(files.map(f=>[path.relative(root,f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))},null,2));
console.log(JSON.stringify(checks,null,2));
