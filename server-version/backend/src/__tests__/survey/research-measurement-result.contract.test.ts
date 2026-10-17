import {describe,it,expect} from 'vitest'
import {projectStoredMeasurement,projectMeasurementReport,measurementReportKey} from '../../modules/assessment-runtime/measurement-result'
import {compileResearchCognitive} from '../../modules/survey/cognitive.definition'
import {cognitiveParentUnit,cognitiveParticipantFeedback} from '../../modules/survey/measurement.result'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import type {LoadedSurveyCognitiveResult} from '../../modules/survey/cognitive.results'
import {computeSurveyFinal,verifySurveyFinalPublication} from '../../modules/survey/final.compute'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'

describe('shared stored measurement/report projection',()=>{
  it('uses stored numeric metrics and quality, with independent participant whitelist',()=>{
    const result=projectStoredMeasurement({identity:{schemaVersion:1,kind:'COGNITIVE',sourceDigest:'s',
      scoringDigest:'r',engineVersion:'1',scoringVersion:'1',protocolDigest:'p'},
      storedResult:{metrics:{hitRate:.8,goMedianRtMs:null,privateSecret:123},quality:{state:'limited',flags:{interrupted:true}},seed:'secret'},
      metricUnits:{hitRate:'ratio',goMedianRtMs:'ms'}})
    expect(result.quality).toEqual({status:'limited',flags:{interrupted:true}})
    expect(projectMeasurementReport(result,'PARTICIPANT',['hitRate','goMedianRtMs'])).toMatchObject({
      metrics:[{key:'hitRate',value:.8,unit:'ratio',status:'OK'},
        {key:'goMedianRtMs',value:null,unit:'ms',status:'NOT_CALCULABLE'}],quality:'limited'})
    expect(JSON.stringify(projectMeasurementReport(result,'PARTICIPANT',['hitRate']))).not.toContain('secret')
    expect(measurementReportKey({resultHash:'a',audience:'PARTICIPANT',policyDigest:'p',rendererVersion:'1'}))
      .not.toBe(measurementReportKey({resultHash:'a',audience:'RESEARCHER',policyDigest:'p',rendererVersion:'1'}))
  })
  it('preserves SJT kernel string-array quality flags without rescoring',()=>{
    const result=projectStoredMeasurement({identity:{schemaVersion:1,kind:'SJT',sourceDigest:'s',
      scoringDigest:'r',engineVersion:'SURVEY_SJT_V2',scoringVersion:'1',protocolDigest:null},
      storedResult:{metrics:[{key:'m',value:null}],quality:{status:'invalid',flags:['missing_responses','metric_not_calculable']}}})
    expect(result.quality).toEqual({status:'invalid',flags:{missing_responses:true,metric_not_calculable:true}})
    expect(result.metrics).toEqual([{key:'m',value:null,unit:null,status:'NOT_CALCULABLE'}])
  })
  it('requires server-verified child map, preserves exact child identity and discloses only selected facts',()=>{
    const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'cog',kind:'COGNITIVE',title:'Test',revision:1,
      definition:{schemaVersion:1,templateKey:'gonogo-software-frame-v1',
        feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate'],release:'AFTER_COLLECTION'}}})
    const frozen=compileResearchCognitive(unit.displayDefinition)
    const reference={slotKey:'cog',epoch:1,resultId:'result',resultHash:'resultHash',measurementDigest:frozen.measurementDigest}
    const loaded={reference,result:{engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:'protocol',
      metrics:{hitRate:.9,goMedianRtMs:320,dPrime:2.3},quality:{state:'interpretable',flags:{}},raw:'must-not-copy'}} as unknown as LoadedSurveyCognitiveResult
    const parent=cognitiveParentUnit(unit,loaded)
    expect(parent.rawAnswers).toEqual({})
    expect(parent.childReference).toEqual(reference)
    expect(JSON.stringify(parent)).not.toContain('must-not-copy')
    expect(cognitiveParticipantFeedback(unit,parent,false)).toEqual({pending:true})
    const report=cognitiveParticipantFeedback(unit,parent,true)!
    expect(report).toMatchObject({pending:false,metrics:[{key:'hitRate',value:.9,unit:'ratio'}]})
    expect(JSON.stringify(report)).not.toContain('dPrime')
    const snapshot={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'p',waveId:'w',
      collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,
      consentDigest:'consent',units:[unit],runtimeStatus:'SURVEY_FINAL_V1'} as ResearchFrozenPublication
    expect(()=>computeSurveyFinal(snapshot,{cog:{}})).toThrow('已验证')
    const verified=verifySurveyFinalPublication(snapshot,canonicalHash(snapshot))!
    expect(verified.compute({cog:{}},null,[],'FINAL',undefined,new Map([['cog',parent]])).units[0]).toEqual(parent)
    expect(()=>verified.compute({cog:{trials:[]}},null,[],'FINAL',undefined,new Map([['cog',parent]]))).toThrow('原始试次')
  })
})
