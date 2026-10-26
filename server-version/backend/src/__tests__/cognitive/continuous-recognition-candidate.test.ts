import { describe, expect, it } from 'vitest'
import { freezeCandidate, replayCandidate, IDENTITY, type FrozenCandidate, type Request } from '../../modules/cognitive/content-candidates/continuous-recognition/protocol'
import { scoreRecognition, projectRecognitionReport, type RawSession, type RawEvent, type ResearchReview } from '../../modules/cognitive/content-candidates/continuous-recognition/scorer'
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T
const request=(profile:'research'|'experience'='experience',seed='recognition-golden'):Request=>({profile,seed,
  formalAssetIds:Array.from({length:184},(_,i)=>'logic-'+i),practiceAssetIds:Array.from({length:6},(_,i)=>'practice-'+i)})
const freeze=(profile:'research'|'experience'='experience')=>freezeCandidate(request(profile))
function raw(f:FrozenCandidate):RawSession {return {snapshotHash:f.snapshotHash,phase:'formal',termination:'completed',events:[],
  records:f.manifest.formal.map(p=>({index:p.index,assetId:p.assetId,kind:p.kind,status:'complete',interruptions:[],
    imageOnsetMs:100+p.plannedOnsetMs,imageOffsetMs:100+p.plannedImageOffsetMs,windowEndMs:100+p.plannedWindowEndMs}))}}
function event(atMs:number,id:string,input:RawEvent['input']='touch'):RawEvent {return {id,atMs,action:'seen',input,key:input==='keyboard'?'r':null,isRepeat:false}}
function answers(f:FrozenCandidate,hits:number,falseAlarms:number):RawSession {
  const r=raw(f)
  f.manifest.targetPairs.forEach((p,i)=>{if(i<hits)r.events.push(event(r.records[p.repeatIndex].imageOnsetMs!+100,'hit-'+i))
    if(i<falseAlarms)r.events.push(event(r.records[p.firstIndex].imageOnsetMs!+100,'false-'+i))})
  r.events.sort((a,b)=>a.atMs-b.atMs);return r
}
const review=(f:FrozenCandidate):ResearchReview=>({snapshotHash:f.snapshotHash,qualityRule:IDENTITY.qualityRule,
  decision:'allow-descriptive-research',reviewerId:'synthetic-test-reviewer',evidenceNote:'Synthetic logic fixture only; no real participant approval.'})
describe('continuous recognition candidate: deterministic protocol',()=>{
  it.each([['research',60,124,16,260],['experience',20,54,6,100]] as const)('%s count arithmetic and paired lag manifest',(profile,t,fill,v,n)=>{
    const f=freeze(profile)
    expect(f.manifest.counts).toEqual({targetFirst:t,targetRepeat:t,fillerFirst:fill,vigilanceRepeat:v,total:n})
    expect(f.manifest.formal[n-1].plannedWindowEndMs).toBe(n*1550)
    expect(f.manifest.targetPairs).toHaveLength(t)
    expect(new Set(f.manifest.readyPoolSizes)).toEqual(new Set([1]))
    expect(f.manifest.targetPairs.every(p=>p.blockLag===5&&p.lagImages>=17&&p.lagImages<=23&&p.interveningImages===p.lagImages-1)).toBe(true)
    expect(f.manifest.vigilancePairs.every(p=>p.blockLag===1)).toBe(true)
    expect(Object.values(f.manifest.lagHistogram).reduce((a,b)=>a+b,0)).toBe(t)
    expect(new Set(f.manifest.formal.map(p=>p.assetId)).size).toBe(t+fill)
  })
  it('replays only the entire original snapshot; changed seed changes actual sequence',()=>{
    const f=freeze();expect(replayCandidate(JSON.parse(JSON.stringify(f)))).toEqual(f)
    expect(freezeCandidate(request())).toEqual(f)
    expect(freezeCandidate(request('experience','other-seed')).manifest.formal).not.toEqual(f.manifest.formal)
  })
  it('verifies actual pair ordering across 20 seeds without enlarging default ready pool',()=>{
    for(let seed=0;seed<20;seed++){
      const f=freezeCandidate(request('research','manifest-'+seed))
      const first=f.manifest.formal.filter(p=>p.kind==='target-first').map(p=>p.assetId)
      const repeated=f.manifest.formal.filter(p=>p.kind==='target-repeat').map(p=>p.assetId)
      expect(repeated).toEqual(first)
      expect(f.manifest.targetPairs.every(p=>p.lagImages===p.repeatIndex-p.firstIndex&&p.blockLag===5)).toBe(true)
    }
  })
  it('isolates practice identities and records its shorter lags explicitly',()=>{
    const f=freeze(), practice=f.manifest.practice
    expect(practice.map(p=>p.assetId)).toEqual(['practice-0','practice-1','practice-2','practice-0','practice-3','practice-1','practice-4','practice-5'])
    expect(practice.filter(p=>p.seenBefore)).toHaveLength(2)
    expect(practice.some(p=>f.manifest.formal.some(x=>x.assetId===p.assetId))).toBe(false)
  })
  it.each(['insufficient','duplicate','overlap','bad-id','unknown-profile','extra-field','empty-seed'])('rejects %s asset/config input',(problem)=>{
    const q:any=request()
    if(problem==='insufficient')q.formalAssetIds=q.formalAssetIds.slice(0,73)
    if(problem==='duplicate')q.formalAssetIds[1]=q.formalAssetIds[0]
    if(problem==='overlap')q.practiceAssetIds[0]=q.formalAssetIds[0]
    if(problem==='bad-id')q.formalAssetIds[0]='../../image'
    if(problem==='unknown-profile')q.profile='standard'
    if(problem==='extra-field')q.targetNum=19
    if(problem==='empty-seed')q.seed=''
    expect(()=>freezeCandidate(q)).toThrow()
  })
  it.each(['identity','parameters','manifest','request','hash','extra'])('rejects altered frozen %s',(part)=>{
    const f:any=clone(freeze())
    if(part==='identity')f.identity.scoringVersion='latest'
    if(part==='parameters')f.parameters.imageMs=700
    if(part==='manifest')f.manifest.formal[0].assetId='wrong'
    if(part==='request')f.request.profile='research'
    if(part==='hash')f.snapshotHash='0'.repeat(64)
    if(part==='extra')f.normVersion='invented'
    expect(()=>replayCandidate(f)).toThrow()
  })
})
describe('continuous recognition candidate: raw validation and paired scoring',()=>{
  it('golden 16/20 hits and 5/20 false alarms, with explicit review and matching report denominators',()=>{
    const f=freeze(),r=answers(f,16,5),s=scoreRecognition(f,r,review(f)),p=projectRecognitionReport(s)
    expect(s.metrics).toMatchObject({hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55,completeTargetPairs:20,targetHits:16,targetFalseAlarms:5})
    expect(p).toMatchObject({state:'interpretable',denominator:20,hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55,logo:'EDUK12.TOP'})
  })
  it('defaults complete records to limited until an explicit bound research review; projection hides performance',()=>{
    const f=freeze(),s=scoreRecognition(f,answers(f,16,5)),p=projectRecognitionReport(s)
    expect(s.metrics.hitRate).toBe(.8);expect(p.state).toBe('limited')
    expect([p.hitRate,p.falseAlarmRate,p.correctedRecognitionRate,p.denominator,p.targetHits,p.targetFalseAlarms]).toEqual(Array(6).fill(null))
    expect(p.canGenerateTakeHomeImage).toBe(false)
  })
  it('keeps negative CRR and permits normal no-response as valid evidence',()=>{
    const f=freeze(),s=scoreRecognition(f,answers(f,6,10),review(f))
    expect(s.metrics.correctedRecognitionRate).toBeCloseTo(-.2)
    expect(projectRecognitionReport(s).correctedRecognitionRate).toBeCloseTo(-.2)
    const noResponse=scoreRecognition(f,raw(f),review(f))
    expect(noResponse.quality.state).toBe('interpretable');expect(noResponse.metrics.hitRate).toBe(0)
  })
  it('never adds filler false alarms or vigilance hits into target HR/FAR',()=>{
    const f=freeze(),r=raw(f)
    for(const p of f.manifest.formal)if(p.kind==='filler-first'||p.kind==='vigilance-repeat')r.events.push(event(r.records[p.index].imageOnsetMs!+100,'aux-'+p.index))
    const s=scoreRecognition(f,r,review(f))
    expect(s.metrics).toMatchObject({hitRate:0,falseAlarmRate:0,completeTargetPairs:20,validFillerFirst:54,fillerFalseAlarmRate:1,validVigilancePairs:6,vigilanceMissRate:0})
  })
  it('shares the same eligible target pair set when either member fails, never substitutes filler denominator',()=>{
    const f=freeze(),r=answers(f,16,5),first=f.manifest.targetPairs[0].firstIndex
    r.records[first].status='timeout'
    const s=scoreRecognition(f,r,review(f))
    expect(s.metrics.completeTargetPairs).toBe(19);expect(s.metrics.hitRate).toBe(15/19);expect(s.metrics.falseAlarmRate).toBe(4/19)
    expect(projectRecognitionReport(s).hitRate).toBeNull()
  })
  it('empty and insufficient streams retain null and invalid/limited states',()=>{
    const f=freeze(),empty=raw(f);empty.records=[];empty.termination='aborted'
    const s=scoreRecognition(f,empty)
    expect(s.quality.state).toBe('invalid');expect(s.metrics.hitRate).toBeNull();expect(s.metrics.vigilanceMissRate).toBeNull()
    const partial=raw(f);partial.records=partial.records.slice(0,90);partial.termination='aborted'
    const part=scoreRecognition(f,partial,review(f));expect(part.quality.state).toBe('limited');expect(projectRecognitionReport(part).correctedRecognitionRate).toBeNull()
  })
  it('assigns image/ISI by half-open boundaries, counting first seen once',()=>{
    const f=freeze(),r=raw(f),a=r.records[0],b=r.records[1]
    r.events=[event(a.imageOffsetMs!,'on-isi'),event(a.imageOffsetMs!+1,'extra'),event(a.windowEndMs!,'next-onset')]
    const s=scoreRecognition(f,r)
    expect(s.audit.firstResponses).toEqual([{index:0,eventId:'on-isi',rtMs:750,phase:'isi'},
      {index:1,eventId:'next-onset',rtMs:0,phase:'image'}])
    expect(b.imageOnsetMs).toBe(a.windowEndMs);expect(s.audit.extraSeen).toBe(1)
  })
  it('retains premature/after-window seen as audit and blocks descriptive release',()=>{
    const f=freeze(),r=raw(f);r.events=[event(99,'early'),event(r.records.at(-1)!.windowEndMs!,'late')]
    const s=scoreRecognition(f,r,review(f));expect(s.audit.prematureSeen).toBe(1);expect(s.audit.outsideSeen).toBe(1)
    expect(s.quality.state).toBe('limited');expect(projectRecognitionReport(s).hitRate).toBeNull()
  })
  it('does not count held repeats, unrelated keys or other actions as seen',()=>{
    const f=freeze(),r=raw(f),at=r.records[0].imageOnsetMs!+1
    r.events=[{...event(at,'held','keyboard'),isRepeat:true},{...event(at+1,'wrong','keyboard'),key:'x'},
      {...event(at+2,'other'),action:'other'},event(at+3,'real','keyboard')]
    const s=scoreRecognition(f,r);expect(s.audit.ignoredEvents).toBe(3);expect(s.audit.firstResponses[0].eventId).toBe('real')
  })
  it('load failure without timestamps and interrupted exposure exclude pairs, not ordinary missed responses',()=>{
    const f=freeze(),r=raw(f),i=f.manifest.targetPairs[0].firstIndex
    r.records[i]={...r.records[i],status:'load-failure',imageOnsetMs:null,imageOffsetMs:null,windowEndMs:null}
    const j=f.manifest.targetPairs[1].repeatIndex;r.records[j].interruptions=[{type:'blur',atMs:r.records[j].imageOnsetMs!+1}]
    const s=scoreRecognition(f,r,review(f));expect(s.metrics.completeTargetPairs).toBe(18);expect(s.quality.state).toBe('limited')
  })
  it.each(['duplicate-event','event-order','wrong-asset','wrong-kind','missing-index','overlap','gap','bad-clock','incomplete-clock','wrong-hash','practice-phase','nonfinite','extra-raw','wrong-review'])('rejects %s raw contract',(problem)=>{
    const f=freeze(),r:any=raw(f),a=r.records[0];let q:any=review(f)
    if(problem==='duplicate-event')r.events=[event(101,'dup'),event(102,'dup')]
    if(problem==='event-order')r.events=[event(102,'a'),event(101,'b')]
    if(problem==='wrong-asset')a.assetId='wrong'
    if(problem==='wrong-kind')a.kind=a.kind==='target-first'?'filler-first':'target-first'
    if(problem==='missing-index')r.records.splice(0,1)
    if(problem==='overlap')r.records[1].imageOnsetMs=a.windowEndMs-1
    if(problem==='gap')r.records[1].imageOnsetMs=a.windowEndMs+1
    if(problem==='bad-clock')a.imageOffsetMs=a.imageOnsetMs
    if(problem==='incomplete-clock')a.imageOffsetMs=null
    if(problem==='wrong-hash')r.snapshotHash='0'.repeat(64)
    if(problem==='practice-phase')r.phase='practice'
    if(problem==='nonfinite')a.imageOnsetMs=Infinity
    if(problem==='extra-raw')r.score=0
    if(problem==='wrong-review')q.snapshotHash='0'.repeat(64)
    expect(()=>scoreRecognition(f,r,q)).toThrow()
  })
  it('hides forged report rates and altered review binding',()=>{
    const f=freeze(),s=scoreRecognition(f,answers(f,16,5),review(f)),bad=clone(s)
    bad.metrics.hitRate=.9
    expect(projectRecognitionReport(bad).hitRate).toBeNull()
    const other=clone(s);other.quality.review!.snapshotHash='0'.repeat(64)
    expect(projectRecognitionReport(other).canGenerateTakeHomeImage).toBe(false)
  })
})

import { createRecognitionSnapshot, recognitionDefinition } from '../../modules/cognitive/content-candidates/continuous-recognition/package'
import { nativeConfig, scoreNativeRecognition, recognitionTrialEnvelope, projectNativeRecognitionReport,
  type NativeConfig, type NativeTrial } from '../../modules/cognitive/content-candidates/continuous-recognition/native'
import { computeProtocolSignature, computeConfigSnapshotHash } from '../../modules/cognitive/v2/canonical'
import type { AuthoritativeScorerInput } from '../../modules/cognitive/v2/types'
function nativeFixture(profile:'research'|'experience'='experience'):AuthoritativeScorerInput<NativeConfig,NativeTrial> {
  const q=request(profile), f=freezeCandidate(q), r=answers(f,profile==='research'?48:16,profile==='research'?15:5)
  const session=createRecognitionSnapshot(profile,q.formalAssetIds,q.practiceAssetIds)
  return {config:session.config,session,randomSeed:q.seed,trials:r.records.map(record=>recognitionTrialEnvelope({record,
    events:r.events.filter(e=>e.atMs>=record.imageOnsetMs!&&e.atMs<record.windowEndMs!),
    startedAtPerfMs:record.imageOnsetMs,endedAtPerfMs:record.windowEndMs,recordOrigin:'live',telemetryOverflow:false}))}
}
describe('continuous recognition native adapter',()=>{
  it.each(['experience','research'] as const)('accepts real frozen %s config and replays matching scorer output',(profile)=>{
    const a=nativeFixture(profile),s=scoreNativeRecognition(a)
    expect(scoreNativeRecognition(clone(a))).toEqual(s)
    expect(s.metrics).toMatchObject({hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55})
    expect(s.quality.state).toBe('limited');expect(s.quality.flags.researchReviewRequired).toBe(true)
    expect(s.audit.trialCount).toBe(profile==='research'?260:100);expect(s).not.toHaveProperty('score')
  })
  it('exports only research/experience with no reference or publication authority and requires asset pools',()=>{
    expect(Object.keys(recognitionDefinition.profiles).sort()).toEqual(['experience','research'])
    expect(recognitionDefinition.references).toEqual([]);expect(recognitionDefinition.publication.status).toBe('DRAFT')
    expect(()=>nativeConfig('experience',[],[])).toThrow()
  })
  it.each(['config-hash','protocol-hash','engine','scorer','config-version','test-type','protocol-rehashed','input-config',
    'frozen-config-rehashed','bad-profile','wrong-seed','extra-review','payload-review','unexpected-reference'])('rejects %s at native authority boundary',(failure)=>{
    const a:any=nativeFixture()
    if(failure==='config-hash')a.session.configHash='0'.repeat(64)
    if(failure==='protocol-hash')a.session.protocolSignature='0'.repeat(64)
    if(failure==='engine')a.session.engineVersion='latest'
    if(failure==='scorer')a.session.scoringVersion='latest'
    if(failure==='config-version')a.session.configVersion='latest'
    if(failure==='test-type')a.session.testType='memory'
    if(failure==='protocol-rehashed'){a.session.protocol.phases[0].required=false;a.session.protocolSignature=computeProtocolSignature(a.session.protocol)}
    if(failure==='input-config')a.config={...a.config,profile:'research'}
    if(failure==='frozen-config-rehashed'){a.session.config={...a.session.config,imageMs:700};a.session.configHash=computeConfigSnapshotHash(a.session.config);a.config=a.session.config}
    if(failure==='bad-profile'){a.session.config={...a.session.config,profile:'standard'};a.session.configHash=computeConfigSnapshotHash(a.session.config);a.config=a.session.config}
    if(failure==='wrong-seed')a.randomSeed='substituted-seed'
    if(failure==='extra-review')a.researchReview={decision:'allow-descriptive-research'}
    if(failure==='payload-review')a.trials[0].payload.researchReview={decision:'allow-descriptive-research'}
    if(failure==='unexpected-reference')a.session.referenceBindings=[{referenceKey:'invented',referenceVersion:'1',referenceHash:'0'.repeat(64)}]
    expect(()=>scoreNativeRecognition(a)).toThrow()
  })
  it.each(['envelope-clock','duration','cross-trial-clock','record-clock','record-truth','record-kind','index','phase','condition',
    'event-wrong-owner','duplicate-across-trials','event-nonfinite'])('rejects %s envelope/record/event mismatch',(failure)=>{
    const a:any=nativeFixture(),e=a.trials[0]
    if(failure==='envelope-clock')e.startedAtPerfMs+=1
    if(failure==='duration')e.durationMs+=.5
    if(failure==='cross-trial-clock'){const n=a.trials[1];n.startedAtPerfMs++;n.durationMs--;n.payload.startedAtPerfMs++;n.payload.record.imageOnsetMs++}
    if(failure==='record-clock')e.payload.record.windowEndMs--
    if(failure==='record-truth')e.payload.record.assetId='wrong'
    if(failure==='record-kind')e.payload.record.kind='vigilance-repeat'
    if(failure==='index')e.trialIndex=1
    if(failure==='phase')e.phase='learning'
    if(failure==='condition')e.condition='incorrect'
    if(failure==='event-wrong-owner')e.payload.events=[event(e.endedAtPerfMs,'next-owned')]
    if(failure==='duplicate-across-trials'){e.payload.events=[event(e.startedAtPerfMs+1,'duplicate')];a.trials[1].payload.events=[event(a.trials[1].startedAtPerfMs+1,'duplicate')]}
    if(failure==='event-nonfinite')e.payload.events=[event(Infinity,'bad')]
    expect(()=>scoreNativeRecognition(a)).toThrow()
  })
  it.each(['timeout','premature','recovered','overflow','visibility_lost','window_blur','resume','runner_restart'])('excludes full target pair for native %s technical source',(source)=>{
    const a=nativeFixture(),f=freezeCandidate(request()),i=f.manifest.targetPairs[0].firstIndex,e=a.trials[i]
    if(source==='timeout')e.flags.timeout=true
    else if(source==='premature')e.flags.premature=true
    else if(source==='recovered')e.payload.recordOrigin='recovered_without_timing'
    else if(source==='overflow')e.payload.telemetryOverflow=true
    else e.qualityEvents=[source as 'visibility_lost'|'window_blur'|'resume'|'runner_restart']
    const s=scoreNativeRecognition(a)
    expect(s.metrics.completeTargetPairs).toBe(19);expect(s.metrics.hitRate).toBe(15/19);expect(s.metrics.falseAlarmRate).toBe(4/19)
    expect(s.quality.flags.technicalLoss).toBe(true);expect(s.metrics.nativeExclusionReasons).toHaveProperty(String(i))
    expect(projectNativeRecognitionReport(s).hitRate).toBeNull()
  })
  it('treats ordinary silence and target miss as valid without technical timeout',()=>{
    const a=nativeFixture();for(const e of a.trials)e.payload.events=[]
    const s=scoreNativeRecognition(a)
    expect(s.metrics.completeTargetPairs).toBe(20);expect(s.metrics.validTrialCount).toBe(100)
    expect(s.metrics.hitRate).toBe(0);expect(s.metrics.falseAlarmRate).toBe(0);expect(s.quality.flags.technicalLoss).toBe(false)
  })
  it('preserves half-open image/ISI boundaries and unique envelope ownership',()=>{
    const a=nativeFixture();for(const e of a.trials)e.payload.events=[]
    const first=a.trials[0],second=a.trials[1]
    first.payload.events=[event(first.payload.record.imageOffsetMs!,'isi')];second.payload.events=[event(second.startedAtPerfMs,'next')]
    const s=scoreNativeRecognition(a),audit=s.metrics.candidateAudit as {firstResponses:Array<{index:number;eventId:string;rtMs:number;phase:string}>}
    expect(audit.firstResponses).toEqual([{index:0,eventId:'isi',rtMs:750,phase:'isi'},{index:1,eventId:'next',rtMs:0,phase:'image'}])
  })
  it('keeps empty/partial native streams invalid/limited and reports hidden',()=>{
    const a=nativeFixture();a.trials=[];expect(scoreNativeRecognition(a).quality.state).toBe('invalid')
    const b=nativeFixture();b.trials=b.trials.slice(0,90);const r=projectNativeRecognitionReport(scoreNativeRecognition(b))
    expect(r.state).toBe('limited');expect(r.hitRate).toBeNull();expect(r.denominator).toBeNull();expect(r.canGenerateTakeHomeImage).toBe(false)
  })
  it('never allows forged interpretable state, cleared flags or internal metrics in native report',()=>{
    const s=scoreNativeRecognition(nativeFixture());s.quality={state:'interpretable',flags:{},reasons:[]}
    const p=projectNativeRecognitionReport(s)
    expect(p.state).toBe('limited');expect([p.hitRate,p.falseAlarmRate,p.correctedRecognitionRate,p.targetHits,p.targetFalseAlarms,p.denominator]).toEqual(Array(6).fill(null))
    expect(p.canGenerateTakeHomeImage).toBe(false)
  })
})
