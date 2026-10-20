/** Finite 300-workflow follow-up. Uses the single probe's HTTP/auth harness. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
const N = 300, INTERVAL = 1000 / 30, INJECTION = 10_000, SUBMIT = 40_000, OBSERVE = 130_000
const prefix = '/composite-assessments'
const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
const percentile = (values, q) => values.length ? [...values].sort((a,b) => a-b)[Math.ceil(values.length*q)-1] : null
export async function runBurstPhase(h) {
  const { mode, state, backend, require, db, read, write, client, result } = h
  const stopPath = path.join(state, 'private/burst-resource-stop.json')
  const journal = path.join(state, 'private/burst-actors.jsonl')
  const marker = path.join(state, 'private/burst-started.json')
  const fixture = read('private/fixture.json')
  const stopped = () => fs.existsSync(stopPath)
  const { gonogoSequence } = require(path.join(backend, 'dist/modules/cognitive/randomization.js'))
  const { createTrialEnvelope } = require(path.join(backend, 'dist/modules/cognitive/v2/trial-envelope.js'))
  const { formSectionSlotKey, compositeItemSlotKey } = require(path.join(backend, 'dist/modules/assessment-runtime/slot-set.js'))
  const trials = session => gonogoSequence(session.randomSeed, 120, session.config.nogoRatio).map((trialType, trialIndex) => createTrialEnvelope({
    trialIndex, phase: 'test', startedAtPerfMs: trialIndex*1500, endedAtPerfMs: trialIndex*1500+800,
    payload: { trialType, responded: trialType === 'go', rtMs: trialType === 'go' ? 300 : null, interrupted: false } }))
  if (mode === 'schedule-check' || mode === 'load') {
    const warmup=performance.now()
    for(let i=0;i<16;i++)JSON.stringify(trials({randomSeed:'prewarm-'+i,config:{nogoRatio:.25}}))
    await wait(500) // Let asynchronous module initialization settle before t0.
    result.driverPrewarmMs=performance.now()-warmup
  }
  if (mode === 'schedule-check') {
    const started = performance.now(), delays = [], arrivals = []
    await Promise.all(Array.from({length:N}, (_,i) => (async () => {
      await wait(started+i*INTERVAL-performance.now())
      const actualAtMs=performance.now()-started;delays.push(actualAtMs-i*INTERVAL);arrivals.push({index:i,actualAtMs,delayMs:actualAtMs-i*INTERVAL})
      JSON.stringify(trials({randomSeed:'scheduler-'+i,config:{nogoRatio:.25}}))
    })()))
    result.scheduler = { planned:N, actual:N, durationMs:performance.now()-started, maxDelayMs:Math.max(...delays), p95DelayMs:percentile(delays,.95),
      networkRequests:0, arrivals, note:'Scheduler plus 120-trial envelope generation only; actual HTTP client capacity remains measured in the real run.' }
    assert.ok(Math.max(...delays)<INTERVAL, 'Dry scheduler could not sustain the arrival cadence')
    return
  }
  if (mode === 'prepare-load') {
    assert.ok(!fs.existsSync(journal) && !fs.existsSync(marker), 'Never automatically repeat uncertain preparation')
    assert.ok(new Date(fixture.product.expiresAt).getTime()>Date.now()+300_000, 'Synthetic publication needs at least five minutes remaining')
    const bcrypt = require('bcryptjs'), password = randomBytes(24).toString('hex'), passwordHash = await bcrypt.hash(password,10)
    const users = Array.from({length:N}, (_,index) => ({ id:randomUUID(), username:'tl-burst-'+index+'-'+randomUUID(), passwordHash,
      role:'STUDENT', accountDomain:'TRAINING', teacherApproved:true, mustChangePassword:false }))
    write('private/burst-accounts.json', {password, users:users.map(({passwordHash,...u})=>u), state:'ABOUT_TO_CREATE'})
    await db.user.createMany({data:users})
    await db.courseStudent.createMany({data:users.map(u=>({courseId:fixture.courseId,studentId:u.id,status:'ACTIVE'}))})
    fs.writeFileSync(journal,'',{mode:0o600,flag:'wx'})
    const append = value => fs.appendFileSync(journal,JSON.stringify(value)+'\n')
    let next=0, failure=null, prepared=0
    // Four preparation lanes only; real authentication and parent admission stay enabled.
    await Promise.all(Array.from({length:4},async()=>{
      while (!failure && !stopped()) {
        const index=next++; if(index>=N)break
        const actor=client({},result,{guard:()=>{if(stopped())throw new Error('RESOURCE_STOP')}}), user=users[index]
        try {
          await actor.login({...user,password})
          append({index,userId:user.id,state:'ABOUT_TO_ADMIT'})
          const {attempt}=await actor.request(`${prefix}/${fixture.product.id}/attempts`,'POST',{})
          assert.equal(attempt.status,'IN_PROGRESS'); assert.equal(attempt.currentItem.type,'FORM_SECTION')
          append({index,userId:user.id,state:'ADMITTED',cookies:actor.cookies(),attempt})
          prepared++
        } catch(error) { failure={index,error:error.message}; append({index,state:'FAILED_OR_UNCERTAIN',error:error.message}) }
      }
    }))
    result.preparation={planned:N,prepared,failure,stopped:stopped(),httpRequests:result.requests.length,lanes:4}
    assert.equal(prepared,N,'Preparation incomplete; do not start injection')
    return
  }
  const actors=fs.readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.state==='ADMITTED').sort((a,b)=>a.index-b.index)
  assert.equal(actors.length,N)
  if (mode === 'verify-load') {
    const ids=actors.map(a=>a.attempt.id), burst=read('evidence/load-result.json')
    const parents=await db.compositeAssessmentAttempt.findMany({where:{id:{in:ids}},select:{id:true,status:true,attemptEpoch:true,asyncReportEpoch:true}})
    const snapshots=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:{in:ids}}})
    const raw=await db.cognitiveRawSubmission.findMany({where:{session:{compositeAttemptId:{in:ids}}}})
    const {decryptUnifiedRuntimePayload:decrypt}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
    const finalByParent=new Map(burst.workflows.map(w=>[w.attemptId,w.submissions]))
    let identityChecked=0, scaleChecked=0, sjtChecked=0
    for(const row of snapshots){
      const parent=parents.find(p=>p.id===row.compositeAttemptId)
      assert.equal(row.attemptEpoch,parent.attemptEpoch)
      assert.ok(finalByParent.get(parent.id).some(s=>s.type===row.unitType && s.submissionId===row.sourceSubmissionId))
      if(row.unitType!=='FORM_SECTION'){
        const value=decrypt(row.canonicalResultEncrypted)
        assert.equal(value.core.sourceDefinitionHash,row.sourceDefinitionHash)
        assert.equal(value.core.compiledRuntimeHash,row.compiledRuntimeHash)
        const metrics=Object.fromEntries(value.core.metrics.map(m=>[m.key,m.value]))
        if(row.unitType==='SCALE'){assert.equal(metrics.total,1);scaleChecked++}
        if(row.unitType==='SITUATIONAL'){assert.equal(metrics.cooperation,fixture.sjtExpected.cooperation);sjtChecked++}
      }
      identityChecked++
    }
    for(const row of raw){assert.equal(row.trialCount,120);assert.equal(decrypt(row.payloadEncrypted).trials.length,120)}
    const completed=parents.filter(p=>p.status==='COMPLETED')
    for(const parent of completed)assert.deepEqual(snapshots.filter(s=>s.compositeAttemptId===parent.id).map(s=>s.unitType).sort(),['COGNITIVE','FORM_SECTION','SCALE','SITUATIONAL'])
    const countWhere={where:{compositeAttemptId:{in:ids}}}
    const counts={forms:await db.compositeFormSectionAttempt.count({where:{attemptId:{in:ids}}}),scales:await db.assessment.count(countWhere),
      cognitive:await db.cognitiveSession.count(countWhere),sjt:await db.situationalAttempt.count(countWhere),snapshots:snapshots.length,
      rawCognitive:raw.length,outbox:await db.compositeReportJob.count({where:{attemptId:{in:ids}}})}
    result.verified={parents:parents.length,parentStatuses:parents.reduce((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{}),completed:completed.length,
      counts,identityChecked,scaleChecked,sjtChecked,cognitiveTrialsChecked:raw.length*120,asyncEnrolled:parents.filter(p=>p.asyncReportEpoch!==null).length,
      clientSucceeded:burst.summary.success,clientReported:burst.summary.reportReady,unknownWritesNotRetried:true}
    assert.equal(counts.outbox,0)
    write('evidence/burst-parent-final-statuses.json',parents)
    return
  }
  assert.equal(mode,'load')
  assert.ok(!fs.existsSync(marker),'One injection only: started marker exists; never repeat uncertain writes')
  assert.ok(!stopped(),'Resource stop exists')
  write('private/burst-started.json',{state:'STARTING_ONCE',count:N,sourceSha:'c3f9a7e77447c706f4a83a93c7429a7bcb164e94'})
  const started=performance.now(), relativeNow=()=>performance.now()-started
  process.once('SIGTERM',()=>{result.interrupted=true;result.interruptedAtMs=relativeNow();write('evidence/load-result.json',result);process.exit(143)})
  let active=0,peakActive=0,httpActive=0,peakHttp=0
  const workflows=Array.from({length:N},(_,i)=>({index:i,attemptId:actors[i].attempt.id,plannedAtMs:i*INTERVAL,requests:[],submissions:[],milestones:[],outcome:'NOT_SENT'}))
  result.workflows=workflows
  result.cutoffsMs={injection:INJECTION,submit:SUBMIT,observation:OBSERVE}
  const classify=w=>{const r=w.requests.at(-1);return r?.outcome?.startsWith('UNKNOWN')?'UNKNOWN':[429,503].includes(r?.status)?'REJECTED':'FAILED'}
  const tasks=workflows.map(async(w)=>{
    await wait(started+w.plannedAtMs-performance.now())
    if(relativeNow()>=INJECTION || stopped()){w.notSentReason=stopped()?'RESOURCE_STOP':'INJECTION_CLOSED';return}
    w.taskStartedAtMs=relativeNow()
    active++;peakActive=Math.max(peakActive,active)
    let attempt=actors[w.index].attempt
    const controls={relativeNow,onStart:at=>{if(w.actualAtMs===undefined){w.actualAtMs=at;w.delayMs=at-w.plannedAtMs;w.late=w.delayMs>=INTERVAL}},inFlight:delta=>{httpActive+=delta;peakHttp=Math.max(peakHttp,httpActive)},remainingMs:()=>SUBMIT-relativeNow(),
      guard:()=>{if(stopped() || relativeNow()>=SUBMIT)throw Object.assign(new Error(stopped()?'RESOURCE_STOP':'SUBMIT_CLOSED'),{deadline:true})}}
    const student=client(actors[w.index].cookies,w,controls)
    try{
      for(const expected of ['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']){
        const unit=attempt.currentItem;assert.equal(unit.type,expected)
        const unitStart=relativeNow();let route,body
        if(expected==='FORM_SECTION'||expected==='SCALE'){
          const checkpoint=await student.request(`${prefix}/attempts/${attempt.id}/checkpoint`)
          const answers=expected==='FORM_SECTION'?Object.fromEntries(unit.answers.map(item=>[item.formItemId,'yes'])):{'mixed-scale-item-1':'yes'}
          await student.request(`${prefix}/attempts/${attempt.id}/checkpoint`,'PUT',{expectedRevision:checkpoint.revision,attemptEpoch:attempt.attemptEpoch,
            envelope:{schemaVersion:1,snapshotHash:checkpoint.trainingPersistence.snapshotHash,definitionHash:attempt.checkpointDefinitionHash,
              drafts:[{slotKey:expected==='FORM_SECTION'?formSectionSlotKey(unit.id):compositeItemSlotKey(unit.id,'SCALE'),answers}],cognitiveResults:[]}})
        }
        if(expected==='FORM_SECTION'){
          route=`${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`
          body={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,
            answers:unit.answers.map(item=>({formItemId:item.formItemId,value:'yes'}))}
        }else if(expected==='SCALE'){
          route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/scale/submit`
          body={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,
            answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:17}]}
        }else if(expected==='COGNITIVE'){
          const session=unit.cognitiveSession;assert.equal(session.config.totalTrials,120)
          route=`/cognitive/sessions/${session.sessionId}/submit`
          body={submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,trials:trials(session)}
        }else{
          route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`
          const runtime=await student.request(route)
          body={submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,
            scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses};route+='/submit'
        }
        const submission={type:expected,submissionId:body.submissionId,state:'ABOUT_TO_SEND'};w.submissions.push(submission)
        await student.request(route,'POST',body);submission.state='ACKNOWLEDGED'
        attempt=await student.request(`${prefix}/attempts/${attempt.id}`)
        w.milestones.push({stage:expected,atMs:relativeNow(),durationMs:relativeNow()-unitStart})
      }
      assert.equal(attempt.status,'COMPLETED');w.completedAtMs=relativeNow();w.outcome='SUCCESS'
      const teacher=client(fixture.cookies.teacher,w,{...controls,remainingMs:()=>OBSERVE-relativeNow(),guard:()=>{if(stopped()||relativeNow()>=OBSERVE)throw new Error('OBSERVATION_CLOSED')}})
      const report=await teacher.request(`${prefix}/${fixture.product.id}/attempts/${attempt.id}/report`)
      assert.equal(report.unitReports.length,3);assert.equal(report.backgroundValues.length,1)
      w.reportReadyAtMs=relativeNow()
    }catch(error){w.error=error.message;w.outcome=w.completedAtMs!==undefined?'COMPLETED_REPORT_FAILED':error.deadline?'STOPPED':classify(w)}
    finally{w.endedAtMs=relativeNow();active--}
  })
  const injectionBoundary=wait(INJECTION).then(()=>{result.injectionClosedAtMs=relativeNow();write('evidence/burst-injection-boundary.json',{
    atMs:relativeNow(),planned:N,issued:workflows.filter(w=>w.actualAtMs!==undefined).length,active,httpActive,peakActive,peakHttp})})
  await Promise.allSettled(tasks);await injectionBoundary
  // With any partial or uncertain outcome, observe the fixed result deadline; never extend it.
  if(workflows.some(w=>w.reportReadyAtMs===undefined))while(relativeNow()<OBSERVE && !stopped())await wait(Math.min(1000,OBSERVE-relativeNow()))
  const issued=workflows.filter(w=>w.actualAtMs!==undefined), completed=workflows.filter(w=>w.completedAtMs!==undefined)
  const latency=completed.map(w=>w.completedAtMs-w.actualAtMs)
  result.summary={planned:N,issued:issued.length,onTime:issued.filter(w=>!w.late).length,late:issued.filter(w=>w.late).length,notSent:N-issued.length,
    success:completed.length,reportReady:workflows.filter(w=>w.reportReadyAtMs!==undefined).length,rejected:workflows.filter(w=>w.outcome==='REJECTED').length,
    failed:workflows.filter(w=>w.outcome==='FAILED'||w.outcome==='COMPLETED_REPORT_FAILED').length,unknown:workflows.filter(w=>w.outcome==='UNKNOWN').length,
    stopped:workflows.filter(w=>w.outcome==='STOPPED').length,peakWorkflowsInFlight:peakActive,peakHttpInFlight:peakHttp,
    firstIssuedMs:issued[0]?.actualAtMs??null,lastIssuedMs:issued.at(-1)?.actualAtMs??null,actualIssuedPer10Seconds:issued.length/10,
    maxArrivalDelayMs:issued.length?Math.max(...issued.map(w=>w.delayMs)):null,p95ArrivalDelayMs:percentile(issued.map(w=>w.delayMs),.95),
    completionLatencyMs:{p50:percentile(latency,.5),p95:percentile(latency,.95),max:latency.length?Math.max(...latency):null},
    unknownWriteRequests:workflows.flatMap(w=>w.requests).filter(r=>r.method!=='GET'&&r.outcome?.startsWith('UNKNOWN')).length,
    unknownReadRequests:workflows.flatMap(w=>w.requests).filter(r=>r.method==='GET'&&r.outcome?.startsWith('UNKNOWN')).length,
    httpRequests:workflows.reduce((sum,w)=>sum+w.requests.length,0),elapsedMs:relativeNow(),resourceStopped:stopped()}
}
