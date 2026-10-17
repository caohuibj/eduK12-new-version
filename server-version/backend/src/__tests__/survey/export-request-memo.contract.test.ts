import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { exportLong, exportWide } from '../../modules/survey/analytics.export-format'
import { rawLongExport, rawWideExport } from '../../modules/survey/analytics.raw-export'
import type { FrozenScoreObservation, SurveyMeasurementIdentity } from '../../modules/survey/analytics.cohorts'
import type { SurveySourceProjection } from '../../modules/survey/analytics.source'

vi.mock('../../modules/assessment-runtime/canonical',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../modules/assessment-runtime/canonical')>()
  return {...actual,canonicalHash:vi.fn(actual.canonicalHash)}
})
const projectId='export-memo-project'
const instant='2026-10-17T00:00:00.000Z'
const measurement=(scoreKey='total'):SurveyMeasurementIdentity=>({
  instrumentKey:'scale/a',scoreKey,scoringDigest:'a'.repeat(64),
  responseSignature:'b'.repeat(64),respondentType:'self_report',unit:null,
})
const scoreSource=()=>{
  const observations:FrozenScoreObservation[]=[]
  for(const waveOrdinal of [2,1])for(const code of ['R-two','R-one'])for(const key of ['total','part']){
    observations.push({projectId,waveId:'wave-'+waveOrdinal,waveOrdinal,
      attemptId:'attempt:'+code+':'+waveOrdinal,researchCode:code,
      sourceFinalHash:'f'.repeat(64),sourceVerified:true,measurement:measurement(key),
      value:key==='total'?-2.5:4,missingReason:null,completedAt:instant})
  }
  const expectedColumns=[1,2,3].flatMap(waveOrdinal=>['total','part'].map(key=>({
    projectId,waveId:'wave-'+waveOrdinal,waveOrdinal,measurement:measurement(key),
  })))
  const attendance=[
    {researchCode:'R-one',waveId:'wave-1',status:'COMPLETED'},
    {researchCode:'R-two',waveId:'wave-2',status:'COMPLETED'},
    {researchCode:'R-one',waveId:'wave-3',status:'STARTED'},
    {researchCode:'R-absent',waveId:'wave-3',status:'QUALITY_EXCLUDED'},
  ]
  return {observations,expectedColumns,attendance}
}
const rawSource=(linked=false):SurveySourceProjection=>{
  const codebook:SurveySourceProjection['codebook']=[2,1].flatMap(waveOrdinal=>['z','a','quoted'].map(itemKey=>({
    columnKey:`W${waveOrdinal}__${itemKey}`,waveId:'wave-'+waveOrdinal,waveOrdinal,
    instrumentKey:'scale/a',itemKey,kind:'SCALE',responseType:'LIKERT',title:'测试',
    prompt:'Unicode／"quoted"',options:[{code:'one',label:'选项'}],
    definitionDigest:'d'.repeat(64),scoringDigest:'a'.repeat(64),publicationVersion:waveOrdinal,
    instrumentRevision:1,timingContract:'SURVEY_SCALE_ITEM_TIMING_V1',
  })))
  const raw:SurveySourceProjection['raw']=codebook.flatMap(c=>['R-two','R-one'].map(code=>({
    projectId,waveId:c.waveId,waveOrdinal:c.waveOrdinal,attemptId:'attempt:'+code+':'+c.waveOrdinal,
    researchCode:linked?code:null,sourceFinalHash:'f'.repeat(64),instrumentKey:c.instrumentKey,
    kind:c.kind,responseType:c.responseType,itemKey:c.itemKey,columnKey:c.columnKey,
    publicationVersion:c.publicationVersion,value:c.itemKey==='quoted'?'=1+1,"line"\n第二行':-2.5,
    missingReason:null,completedAt:instant,sourceVerified:true,
  })))
  return {projectId,collectionMode:linked?'LINKED_WAVES':'SINGLE_UNLINKED',completeAttempts:4,
    sourceRevision:7,cutOff:instant,raw,codebook,scores:[],scoreColumns:[],attendance:[]}
}
// Frozen pre-memo artifact bytes, including CSV order, codebook order and every manifest field.
const artifactDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const attemptCalls=()=>vi.mocked(canonicalHash).mock.calls.filter(([value])=>
  typeof value==='string'&&value.startsWith('attempt:'))
const measurementCalls=()=>vi.mocked(canonicalHash).mock.calls.filter(([value])=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)&&'instrumentKey' in value)

describe('Survey export request-local exact-identity hash memo',()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(instant));vi.mocked(canonicalHash).mockClear()})
  afterEach(()=>vi.useRealTimers())

  it('hashes each anonymous attempt once across raw sorting and row serialization',()=>{
    const result=rawLongExport(projectId,rawSource())
    expect.soft(artifactDigest(result)).toBe('673094a355b75f01eab31477671367d89932d8a8794ffa8937644cf79f66ddc7')
    expect.soft(attemptCalls()).toHaveLength(4)
    const wave=rawLongExport(projectId,rawSource(),'wave-2')
    expect.soft(artifactDigest(wave)).toBe('f86ba10136a746b84b5184490bccdfa409f024a0bb0af2da85b5ac5aa674f2bc')
    expect.soft(attemptCalls()).toHaveLength(6)
  })

  it('hashes each score identity and attempt only once in one Long export',()=>{
    const {observations,attendance,expectedColumns}=scoreSource()
    const result=exportLong(projectId,observations,attendance,expectedColumns)
    expect.soft(artifactDigest(result)).toBe('1609e5ce43b81f425ff6ea103f63758215149a27fd428d72df0421e036a4a34f')
    expect.soft(measurementCalls()).toHaveLength(2)
    expect.soft(attemptCalls()).toHaveLength(4)
  })

  it('hashes each score identity only once in one Wide export, keeping zero-FINAL columns',()=>{
    const {observations,attendance,expectedColumns}=scoreSource()
    const result=exportWide(projectId,observations,attendance,expectedColumns)
    expect.soft(artifactDigest(result)).toBe('f0c1e30b11528b8851495e76a25778e0f0a97c3d78eb0946c7007df288d603e0')
    expect.soft(measurementCalls()).toHaveLength(2)
    expect.soft(attemptCalls()).toHaveLength(0)
    const raw=rawWideExport(projectId,rawSource(true))
    expect.soft(artifactDigest(raw)).toBe('1c35b54f6359a50cc55d8830fccb796db3f0cba678e3c41dbf40625232debb7d')
    expect.soft(attemptCalls()).toHaveLength(0)
  })

  it('does not reuse values or source authorization across export invocations',()=>{
    const {observations,attendance,expectedColumns}=scoreSource()
    const first=exportLong(projectId,observations,attendance,expectedColumns)
    const second=exportLong(projectId,observations,attendance,expectedColumns)
    expect(second).toEqual(first)
    expect.soft(measurementCalls()).toHaveLength(4)
    expect.soft(attemptCalls()).toHaveLength(8)
    const raw=rawSource()
    rawLongExport(projectId,raw);rawLongExport(projectId,raw)
    expect.soft(attemptCalls()).toHaveLength(16)
    expect(()=>exportLong(projectId,[{...observations[0],projectId:'other'}])).toThrow(/project-owned/)
    expect(()=>exportLong(projectId,[{...observations[0],missingReason:'WITHDRAWN'}])).toThrow(/Withdrawn/)
    expect(()=>rawLongExport(projectId,{...raw,raw:[{...raw.raw[0],sourceVerified:false as never}]}))
      .toThrow(/verified scoped/)
  })

  it('separates every measurement identity dimension despite sanitized-name or delimiter collisions',()=>{
    const variants:SurveyMeasurementIdentity[]=[measurement(),
      {...measurement(),instrumentKey:'scale_a'}, {...measurement(),scoreKey:'other'},
      {...measurement(),scoringDigest:'v2'}, {...measurement(),responseSignature:'v2'},
      {...measurement(),respondentType:'observer'}, {...measurement(),unit:''},
      {...measurement(),instrumentKey:'a:b',scoreKey:'c'},
      {...measurement(),instrumentKey:'a',scoreKey:'b:c'},
    ]
    const expectedColumns=variants.flatMap(m=>[1,2].map(waveOrdinal=>({
      projectId,waveId:'wave-'+waveOrdinal,waveOrdinal,measurement:{...m},
    })))
    const result=exportWide(projectId,[],[],expectedColumns)
    expect(result.codebook).toHaveLength(variants.length*2)
    expect(new Set(result.codebook.map(c=>c.column)).size).toBe(variants.length*2)
    expect.soft(measurementCalls()).toHaveLength(variants.length)
  })

  it('still rejects malformed hash input after a valid identity populated the local memo',()=>{
    const valid={projectId,waveId:'wave-1',waveOrdinal:1,measurement:measurement()}
    for(const unit of [undefined,NaN,Infinity]){
      expect(()=>exportWide(projectId,[],[],[valid,
        {...valid,measurement:{...measurement(),unit:unit as never}},
      ])).toThrow(/undefined|finite/)
    }
  })
})
