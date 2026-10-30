import {inheritedSurveyTrackingUnit,surveyTrackingDefaultSelections} from '../../modules/survey/tracking-source'
import {freezeSurveyParticipantFeedback,surveyRawMetricDisclosure} from '../../modules/survey/participant-feedback'
import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {projectPersonalChanges,latestCompletedParents,type PersonalTrackingPlan,type PersonalLeafResult} from '../../modules/reporting/personal-tracking'
import {freezeSurveyTracking,surveyPersonalLeaf} from '../../modules/survey/personal-tracking'
import {compileFrozenResearchUnit,type ResearchFrozenUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {surveyMeasurementReleaseInput} from '../../modules/survey/publication.service'

const hash=canonicalHash({items:['A'],scoring:'sum'})
const plan:PersonalTrackingPlan={schemaVersion:1,id:randomUUID(),baselineWaveId:'t1',metrics:[
  {id:'A-total',sourceKey:'A',scoreKey:'total',label:'A 总分',kind:'SCALE',unit:'points',measurementHash:hash},
  {id:'B-total',sourceKey:'B',scoreKey:'total',label:'B 总分',kind:'SCALE',unit:'points',measurementHash:hash},
]}
const waves=[{id:'t1',ordinal:1},{id:'t2',ordinal:2},{id:'t3',ordinal:3}]
const row=(ordinal:number,a:number|null,b:number|null):PersonalLeafResult=>({waveId:'t'+ordinal,ordinal,scopedSubjectId:'survey:p:person',attemptId:'attempt'+ordinal,resultId:'result'+ordinal,sourceHash:'hash'+ordinal,
  completedAt:`2026-10-${ordinal.toString().padStart(2,'0')}T12:00:00Z`,metrics:{
    'A-total':{value:a,unit:'points',measurementHash:hash,visible:true},'B-total':{value:b,unit:'points',measurementHash:hash,visible:true}}})
describe('Personal exact raw-score changes',()=>{
  it('keeps zero and signed differences; independent missing metrics do not erase other trends',()=>{
    const report=projectPersonalChanges(plan,waves,[row(1,0,10),row(2,-2,null),row(3,4,8)])
    expect(report.status).toBe('AVAILABLE')
    expect(report.metrics[0].points.map(p=>p.value)).toEqual([0,-2,4])
    expect(report.metrics[0].adjacent.map(p=>p.delta)).toEqual([-2,6])
    expect(report.metrics[1].adjacent.map(p=>p.delta)).toEqual([null,null])
    expect(report.metrics[1].baseline[1]).toMatchObject({delta:-2,intermediateMissing:true})
  })
  it('retains another disclosed metric with one result after any metric makes the report available',()=>{
    const report=projectPersonalChanges(plan,waves,[row(1,0,10),row(2,1,null)])
    expect(report.status).toBe('AVAILABLE')
    expect(report.metrics[1].points.map(p=>p.value)).toEqual([10,null,null])
    expect(report.metrics[1].adjacent.map(p=>p.delta)).toEqual([null,null])
    expect(()=>projectPersonalChanges(plan,waves,[row(1,0,0),{...row(2,1,1),scopedSubjectId:'different-person'}])).toThrow('one scoped subject')
  })
  it('retains wholly missing disclosed metrics and separates release timing from authorization',()=>{
    const first=row(1,0,null),second=row(2,1,null)
    const hidden={...plan.metrics[1],id:'private',label:'不可见指标'}
    for(const r of [first,second])r.metrics.private={value:999,visible:false,measurementHash:hash,unit:'points'}
    const report=projectPersonalChanges({...plan,metrics:[...plan.metrics,hidden]},waves.slice(0,2),[first,second])
    expect(report.status).toBe('AVAILABLE')
    expect(report.metrics.map(m=>m.id)).toEqual(['A-total','B-total'])
    expect(report.metrics[1].points.map(p=>p.missingReason)).toEqual(['INVALID_OR_MISSING','INVALID_OR_MISSING'])
    for(const r of [first,second]){r.metrics['B-total'].pending=true;r.metrics['B-total'].value=123}
    const pending=projectPersonalChanges(plan,waves.slice(0,2),[first,second])
    expect(pending.metrics[1].points.map(p=>p.value)).toEqual([null,null])
    expect(pending.metrics[1].points.map(p=>p.missingReason)).toEqual(['PENDING_RELEASE','PENDING_RELEASE'])
  })
  it('does not bridge a missing T2; baseline-to-T3 stays possible',()=>{
    const report=projectPersonalChanges(plan,waves,[row(1,1,1),row(3,3,3)])
    expect(report.metrics[0].adjacent.map(p=>p.delta)).toEqual([null,null])
    expect(report.metrics[0].baseline[1]).toMatchObject({delta:2,intermediateMissing:true})
  })
  it('selects newest complete whole parent before projecting, without per-metric fallback',()=>{
    const newer={...row(2,null,2),completedAt:'2026-10-02T13:00:00Z',resultId:'new'}
    const report=projectPersonalChanges(plan,waves,[row(1,0,1),row(2,3,3),newer,row(3,4,4)])
    expect(report.metrics[0].points[1].value).toBeNull()
    const picked=latestCompletedParents([{waveId:'t1',resultId:'a',completedAt:null},
      {waveId:'t1',resultId:'b',completedAt:'2026-10-01T00:00:00Z'},{waveId:'t1',resultId:'c',completedAt:'2026-10-01T00:00:00Z'}])
    expect(picked.get('t1')?.resultId).toBe('c')
  })
  it('withholds hidden, protocol-mismatched and unit-mismatched values',()=>{
    const r=row(2,99,99);r.metrics['A-total'].visible=false;r.metrics['B-total'].unit='ms'
    expect(projectPersonalChanges(plan,waves.slice(0,2),[row(1,0,0),r]).status).toBe('WAITING')
    r.metrics['A-total'].visible=true;r.metrics['A-total'].measurementHash=canonicalHash('different-protocol')
    expect(projectPersonalChanges(plan,waves.slice(0,2),[row(1,0,0),r]).metrics).toEqual([])
  })
})
const unit=(name:string):ResearchFrozenUnit=>({draftId:randomUUID(),instrumentKey:name,kind:'SCALE',title:name,draftRevision:1,
  sourceDigest:hash,scoringDigest:hash,compiledDefinition:{scoring:{scores:[{key:'total',label:'总分'}]}},displayDefinition:{},
  measurementRelease:{releaseId:'release',contentHash:hash,measurementHash:hash},trackingIdentity:{measurementHash:hash,metrics:[{key:'total',label:'总分',unit:'points'}]},
  participantFeedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_FINAL'}})
describe('Frozen Survey tracking plan and leaf identity',()=>{
  it.each(['ONLY_A','NONE'] as const)('applies an explicit %s narrowing to inherited A/B without retaining old feedback or P/R choices',choice=>{
    const originals=['A','B'].map(unit)
    for(const u of originals)u.contentSelection={referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:'release',choices:[]},reportRelease:{releaseId:randomUUID(),contentHash:hash}}
    const t1=freezeSurveyTracking({projectId:'project',waveId:'t1',ordinal:1,collectionMode:'LINKED_WAVES',existing:null,firstPublishedAt:null,
      units:originals,selection:{mode:'LONGITUDINAL',metrics:originals.map(u=>({instrumentId:u.draftId,scoreKey:'total'}))}})!
    const source={units:originals,longitudinal:t1.binding} as ResearchFrozenPublication
    const next=originals.map(u=>inheritedSurveyTrackingUnit(source,{id:u.draftId,instrumentKey:u.instrumentKey})!)
    expect(next.every(u=>u.participantFeedback===undefined&&u.contentSelection===undefined&&u.longitudinalMetricKeys===undefined)).toBe(true)
    const defaults=surveyTrackingDefaultSelections(source,next)
    expect(defaults.participantFeedback).toHaveLength(2)
    expect(defaults.contentSelections).toHaveLength(2)
    // Same explicit array selection as publication; [] must never use defaults.
    const selected=choice==='ONLY_A'?defaults.participantFeedback.slice(0,1):[]
    freezeSurveyParticipantFeedback(next,selected,new Map(next.map(u=>[u.draftId,['total']])))
    freezeSurveyTracking({projectId:'project',waveId:'t2',ordinal:2,collectionMode:'LINKED_WAVES',existing:t1.plan,firstPublishedAt:new Date(),
      units:next,selection:{mode:'LONGITUDINAL',metrics:[]}})
    expect(surveyRawMetricDisclosure(next[1],true)).toBeNull()
    expect(next[1].longitudinalMetricKeys).toEqual([])
    expect(surveyRawMetricDisclosure(next[0],true)!==null).toBe(choice==='ONLY_A')
    expect(next[0].longitudinalMetricKeys).toEqual(choice==='ONLY_A'?['total']:[])
    expect(originals.every(u=>u.participantFeedback?.mode==='DESCRIPTIVE'&&u.contentSelection?.reportRelease)).toBe(true)
  })
  it('inherits ABC from ABCD into ABCE, binds same-named totals to their own tool, and does not expand disclosure',()=>{
    const units=['A','B','C','D'].map(unit)
    units[1].participantFeedback=undefined
    const t1=freezeSurveyTracking({projectId:'project',waveId:'t1',ordinal:1,collectionMode:'LINKED_WAVES',existing:null,firstPublishedAt:null,
      units,selection:{mode:'LONGITUDINAL',metrics:units.slice(0,3).map(u=>({instrumentId:u.draftId,scoreKey:'total'}))}})!
    expect(t1.plan.metrics).toHaveLength(3)
    expect(units[1].longitudinalMetricKeys).toEqual([])
    const next=[...units.slice(0,3),unit('E')]
    const t2=freezeSurveyTracking({projectId:'project',waveId:'t2',ordinal:2,collectionMode:'LINKED_WAVES',existing:t1.plan,firstPublishedAt:new Date(),units:next})!
    expect(t2.binding.metrics.map(b=>b.metricId)).toEqual(t1.binding.metrics.map(b=>b.metricId))
    const result={schemaVersion:1 as const,definitionDigest:hash,units:next.map((u,i)=>({instrumentKey:u.instrumentKey,kind:u.kind,sourceDigest:hash,scoringDigest:hash,rawAnswers:{},missing:[],privateScoring:{scores:[{key:'total',value:i,status:'calculated'}],quality:{status:'interpretable'}}}))}
    const snapshot={units:next,longitudinal:t2.binding} as ResearchFrozenPublication
    const leaf=surveyPersonalLeaf({scopedSubjectId:'subject',waveId:'t2',ordinal:2,attemptId:'a',resultId:'r',completedAt:new Date().toISOString(),sourceHash:hash,snapshot,result,collectionClosed:true})
    expect(leaf.metrics[t1.plan.metrics[0].id].value).toBe(0)
    expect(leaf.metrics[t1.plan.metrics[2].id].value).toBe(2)
    expect(leaf.metrics[t1.plan.metrics[1].id].visible).toBe(false)
    expect(()=>freezeSurveyTracking({projectId:'p',waveId:'t3',ordinal:3,collectionMode:'LINKED_WAVES',existing:t1.plan,firstPublishedAt:new Date(),units:[next[0]]})).toThrow('缺少追踪工具')
  })
  it('rejects unlinked and retroactive tracking, measurement changes and single-mode downgrades',()=>{
    const u=unit('A'),selection={mode:'LONGITUDINAL' as const,metrics:[{instrumentId:u.draftId,scoreKey:'total'}]}
    const first={projectId:'p',waveId:'w',ordinal:1,collectionMode:'LINKED_WAVES',existing:null,firstPublishedAt:null,units:[u],selection}
    expect(()=>freezeSurveyTracking({...first,collectionMode:'SINGLE_UNLINKED'})).toThrow('稳定')
    expect(()=>freezeSurveyTracking({...first,firstPublishedAt:new Date()})).toThrow('首次发布')
    const existing=freezeSurveyTracking(first)!.plan
    expect(()=>freezeSurveyTracking({...first,existing,selection:{mode:'SINGLE',metrics:[]}})).toThrow('不能降为单次')
    expect(()=>freezeSurveyTracking({...first,existing,selection:undefined,units:[{...u,trackingIdentity:{...u.trackingIdentity!,measurementHash:canonicalHash('changed')}}]})).toThrow('已变化')
  })
  it('keeps invalid cognitive values out of personal comparisons and shared numeric facts',()=>{
    const cognitive=compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'cog',kind:'COGNITIVE',title:'认知',revision:1,
      definition:{schemaVersion:1,templateKey:'gonogo-software-frame-v1',feedback:{policyVersion:'SURVEY_DESCRIPTIVE_V1',mode:'DESCRIPTIVE',metricKeys:['hitRate'],release:'AFTER_FINAL'}}})
    cognitive.longitudinalMetricKeys=['hitRate']
    const frozen=cognitive.compiledDefinition as {measurementDigest:string}
    const result={instrumentKey:'cog',kind:'COGNITIVE' as const,sourceDigest:cognitive.sourceDigest,scoringDigest:cognitive.scoringDigest,
      rawAnswers:{},missing:[],privateScoring:null,measurement:{schemaVersion:1 as const,measurementDigest:frozen.measurementDigest,
        identity:{schemaVersion:1 as const,kind:'COGNITIVE' as const,sourceDigest:cognitive.sourceDigest,scoringDigest:cognitive.scoringDigest,engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolDigest:hash},
        metrics:[{key:'hitRate',value:0.99,unit:'ratio',status:'OK' as const}],quality:{status:'invalid',flags:{}}}}
    const snapshot={units:[cognitive],longitudinal:{planId:plan.id,metrics:[{metricId:'hit',draftId:cognitive.draftId,instrumentKey:'cog',scoreKey:'hitRate',measurementHash:hash,unit:'ratio'}]}} as ResearchFrozenPublication
    const leaf=surveyPersonalLeaf({scopedSubjectId:'subject',waveId:'t1',ordinal:1,attemptId:'a',resultId:'r',completedAt:new Date().toISOString(),sourceHash:hash,
      snapshot,result:{schemaVersion:1,definitionDigest:hash,units:[result]},collectionClosed:true})
    expect(leaf.metrics.hit.value).toBeNull()
    expect(leaf.metrics.hit.visible).toBe(true)
  })
  it('keeps raw-score disclosure eligibility when values are invalid, absent, unreached or not yet released',()=>{
    const u=unit('B');u.longitudinalMetricKeys=['total']
    const result={instrumentKey:u.instrumentKey,kind:u.kind,sourceDigest:u.sourceDigest,scoringDigest:u.scoringDigest,rawAnswers:{},missing:[],
      privateScoring:{scores:[{key:'total',value:null,status:'not_calculable'}],quality:{status:'invalid'}}}
    const snapshot={units:[u],longitudinal:{planId:plan.id,metrics:[{metricId:'B-total',draftId:u.draftId,instrumentKey:'B',scoreKey:'total',measurementHash:hash,unit:'points'}]}} as ResearchFrozenPublication
    const read=(closed:boolean,notExecuted=false)=>surveyPersonalLeaf({scopedSubjectId:'subject',waveId:'t1',ordinal:1,attemptId:'a',resultId:'r',completedAt:new Date().toISOString(),sourceHash:hash,
      snapshot,result:{schemaVersion:1,definitionDigest:hash,units:[{...result,...(notExecuted?{notExecuted:true as const}:{})}]},collectionClosed:closed}).metrics['B-total']
    expect(read(true)).toMatchObject({visible:true,pending:false,value:null})
    u.participantFeedback!.release='AFTER_COLLECTION'
    expect(read(false)).toMatchObject({visible:true,pending:true,value:null})
    result.privateScoring.scores=[]
    expect(read(true)).toMatchObject({visible:true,pending:false,value:null})
    expect(read(true,true)).toMatchObject({visible:true,value:null,missingReason:'NOT_EXECUTED'})
    u.sourceProvenance={reportConfigured:false}
    expect(read(true).visible).toBe(false)
  })
  it('inherits every required slot of a tracked fixed Bundle without cloning or mutating its source',()=>{
    const a=unit('A'),b=unit('B'),source={units:[a,b],longitudinal:{planId:plan.id,metrics:[{metricId:'a',draftId:a.draftId,instrumentKey:'A',scoreKey:'total',measurementHash:hash,unit:'points'}]},
      governedPackages:[{family:'BUNDLE',slots:[{draftId:a.draftId},{draftId:b.draftId}]}]} as ResearchFrozenPublication
    const inherited=inheritedSurveyTrackingUnit(source,{id:b.draftId,instrumentKey:'B'})!
    expect(inherited).toEqual({...b,participantFeedback:undefined})
    inherited.title='local change'
    expect(b.title).toBe('B')
    expect(inheritedSurveyTrackingUnit({...source,governedPackages:[]},{id:b.draftId,instrumentKey:'B'})).toBeUndefined()
    expect(()=>inheritedSurveyTrackingUnit(source,{id:a.draftId,instrumentKey:'A',catalogGrantId:'other-grant'})).toThrow('来源授权不一致')
  })
  it('C identity excludes report wording and P/R selections, while preserving item/scoring definitions',()=>{
    const d={id:randomUUID(),instrumentKey:'scale',kind:'SCALE',title:'量表',revision:1,definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
      responseOptions:[{optionKey:'zero',label:'0',score:0},{optionKey:'one',label:'1',score:1}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],
      items:[{itemKey:'item',prompt:'题目',required:true,reverse:false,dimensionKeys:['total']}]}}
    const a=compileFrozenResearchUnit(d)
    const b=compileFrozenResearchUnit({...d,revision:2,definition:{...d.definition,rawScoreFeedback:{schemaVersion:1,rules:[]}}})
    // Reporting-only fields stay out of the measurement release; no runtime scoringDigest shortcut.
    b.compiledDefinition={...(a.compiledDefinition as object),report:{...(a.compiledDefinition as {report:object}).report,reportVersion:'new'}}
    const get=(u:ResearchFrozenUnit)=>surveyMeasurementReleaseInput(u,'owner','project')
    const ar=get(a),br=get(b)
    expect(ar.layer).toBe('MEASUREMENT');expect(br.layer).toBe('MEASUREMENT')
    if(ar.layer==='MEASUREMENT'&&br.layer==='MEASUREMENT')expect(ar.content.measurementHash).toBe(br.content.measurementHash)
  })
})
