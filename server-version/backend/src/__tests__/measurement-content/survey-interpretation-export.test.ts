import {describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {checkedStoredSurveyInterpretation,interpretationLongExport} from '../../modules/survey/analytics.interpretation-export'
import type {SurveyAttemptContentBinding} from '../../modules/survey/content-binding.service'
import type {SurveySourceProjection} from '../../modules/survey/analytics.source'
vi.mock('../../modules/measurement-content/reference-policy',()=>({selectFrozenReferencePolicy:()=>{throw new Error('Selection on export forbidden')}}))
vi.mock('../../modules/assessment-reference/reference',()=>({resolveAssessmentReference:()=>{throw new Error('Recalculation on export forbidden')}}))
const binding:SurveyAttemptContentBinding={schemaVersion:1,projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication',
  definitionDigest:'a'.repeat(64),populationContext:{},units:[{instrumentKey:'scale',measurement:{releaseId:'m',contentHash:'b'.repeat(64),measurementHash:'c'.repeat(64)},
    references:[{metricKey:'metric',referenceKind:'descriptive_sample',status:'SELECTED',releaseId:'r',contentHash:'d'.repeat(64),entryKey:'e'.repeat(64)}],
    report:{releaseId:'report',contentHash:'f'.repeat(64)},reportAvailability:'AVAILABLE'}]}
const interpretation=()=>({schemaVersion:1 as const,contentBindingHash:canonicalHash(binding),units:[{instrumentKey:'scale',status:'INTERPRETED' as const,
  references:[{metricKey:'metric',referenceKind:'descriptive_sample' as const,status:'AVAILABLE' as const,values:{z:1,t:60,percentile:{value:84,estimated:true},meanDifference:3,bandKey:null}}],
  report:{status:'READY' as const,generatorVersion:'DECLARATIVE_REPORT_V1'}}]})
function source():SurveySourceProjection{return {projectId:'project',collectionMode:'SINGLE_UNLINKED',sourceRevision:1,cutOff:'2026-10-20T00:00:00Z',
  completeAttempts:1,scores:[],scoreColumns:[],raw:[],codebook:[],attendance:[],interpretations:[{projectId:'project',waveId:'wave',waveOrdinal:1,
    attemptId:'attempt',researchCode:null,sourceFinalHash:'1'.repeat(64),completedAt:'2026-10-19T00:00:00Z',sourceVerified:true,binding,interpretation:interpretation()}]}}
describe('stored interpretation long CSV projection',()=>{
  it('exports saved values and exact pointers without any calculation, selection or whole private objects',()=>{
    const result=interpretationLongExport('project',source(),'wave')
    expect(result.csv).toContain('"1","60","84","true","3"')
    expect(result.csv).toContain('"m"');expect(result.csv).toContain('"r"');expect(result.csv).toContain('"report"')
    expect(result.csv).not.toContain('"attempt"');expect(result.csv).not.toMatch(/populationContext|referencePolicy|norm|template|sampleManifest/)
    expect(result.manifest).toMatchObject({rowCount:1,legacyFinalCount:0,interpretedFinalCount:1})
  })
  it('rejects invalid hash, nonfinite values, injected payloads and unmapped slots',()=>{
    expect(()=>checkedStoredSurveyInterpretation({...interpretation(),contentBindingHash:'0'.repeat(64)},binding)).toThrow()
    const invalid=interpretation();invalid.units[0].references[0].values.z=Infinity
    expect(()=>checkedStoredSurveyInterpretation(invalid,binding)).toThrow()
    expect(()=>checkedStoredSurveyInterpretation({...interpretation(),template:{secret:'private'}},binding)).toThrow()
    const other=interpretation();other.units[0].references[0].metricKey='other'
    expect(()=>checkedStoredSurveyInterpretation(other,binding)).toThrow()
  })
  it('makes legacy absence explicit and rejects unavailable-with-values or scope mismatch',()=>{
    const legacy=source();legacy.interpretations![0].interpretation=null;legacy.interpretations![0].binding=null
    expect(interpretationLongExport('project',legacy,'wave').csv).toContain('LEGACY_NOT_RECORDED')
    expect(()=>interpretationLongExport('other',source(),'wave')).toThrow()
    const unavailable=interpretation();(unavailable.units[0].references[0] as {status:string}).status='UNAVAILABLE'
    expect(()=>checkedStoredSurveyInterpretation(unavailable,binding)).toThrow()
  })
})
