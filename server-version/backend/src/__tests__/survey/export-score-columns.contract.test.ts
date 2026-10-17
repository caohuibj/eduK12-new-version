import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash, canonicalJsonString } from '../../modules/assessment-runtime/canonical'
import { exportLong, exportWide } from '../../modules/survey/analytics.export-format'
import type { FrozenScoreObservation, SurveyMeasurementIdentity } from '../../modules/survey/analytics.cohorts'

vi.mock('../../modules/assessment-runtime/canonical',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../modules/assessment-runtime/canonical')>()
  return {...actual,canonicalHash:vi.fn(actual.canonicalHash),canonicalJsonString:vi.fn(actual.canonicalJsonString)}
})
const projectId='export-memo-project'
const instant='2026-10-17T00:00:00.000Z'
const measurement=(scoreKey='total'):SurveyMeasurementIdentity=>({
  instrumentKey:'scale/a',scoreKey,scoringDigest:'a'.repeat(64),
  responseSignature:'b'.repeat(64),respondentType:'self_report',unit:null,
})
const fixture=()=>{
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
const artifactDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const encodings=()=>vi.mocked(canonicalJsonString).mock.calls.length
const measurementHashes=()=>vi.mocked(canonicalHash).mock.calls.filter(([value])=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)&&'instrumentKey' in value).length

// Digests were recorded before the residual optimization. They cover all CSV
// bytes, codebook ordering/metadata and manifest fields, including the clock.
describe('Survey score column decoration within one serializer call',()=>{
  beforeEach(()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(instant))
    vi.mocked(canonicalHash).mockClear();vi.mocked(canonicalJsonString).mockClear()
  })
  afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})

  it.each([
    ['LONG',exportLong,'1609e5ce43b81f425ff6ea103f63758215149a27fd428d72df0421e036a4a34f'],
    ['WIDE',exportWide,'f0c1e30b11528b8851495e76a25778e0f0a97c3d78eb0946c7007df288d603e0'],
  ] as const)('%s validates each supplied identity once and reuses column names without changing bytes',(_format,serialize,digest)=>{
    const {observations,attendance,expectedColumns}=fixture()
    const replace=vi.spyOn(String.prototype,'replace')
    const result=serialize(projectId,observations,attendance,expectedColumns)
    expect.soft(artifactDigest(result)).toBe(digest)
    expect.soft(encodings()).toBe(observations.length+expectedColumns.length)
    expect.soft(measurementHashes()).toBe(2)
    // Count only safeName's regex, not CSV escaping or Vitest's own strings.
    const sanitizations=replace.mock.calls.filter(([pattern])=>
      pattern instanceof RegExp&&pattern.source==='[^a-z0-9_]'&&pattern.flags==='gi')
    expect.soft(sanitizations).toHaveLength(4)
  })

  it.each([['LONG',exportLong],['WIDE',exportWide]] as const)(
    '%s builds one codebook record per output column, retaining last-wins metadata',(_format,serialize)=>{
      let instrumentReads=0
      const expectedColumns=Array.from({length:20},(_,i)=>({
        projectId,waveId:'wave-'+i,waveOrdinal:1,
        measurement:{...measurement(),get instrumentKey(){instrumentReads++;return 'scale/a'}},
      }))
      const result=serialize(projectId,[],[],expectedColumns)
      expect(result.codebook).toHaveLength(1)
      expect(result.codebook[0].waveId).toBe('wave-19')
      expect.soft(encodings()).toBe(expectedColumns.length)
      // Each supplied identity is read for validation; only the winning input
      // is read again for the single codebook record. No first-wins shortcut.
      expect.soft(instrumentReads).toBe(expectedColumns.length+1)
    })

  it('keeps attendance expansion independent of identity validation work',()=>{
    const {expectedColumns}=fixture()
    const attendance=Array.from({length:100},(_,i)=>({
      researchCode:'R-'+i,waveId:'wave-1',status:i%2?'QUALITY_EXCLUDED':'STARTED',
    }))
    const result=exportLong(projectId,[],attendance,expectedColumns)
    expect(result.manifest.rowCount).toBe(600)
    expect.soft(encodings()).toBe(expectedColumns.length)
    expect(result.csv).toContain('QUALITY_EXCLUDED')
    expect(result.csv).toContain('ABANDONED')
    expect(result.csv).toContain('NO_WAVE')
  })

  it.each([['LONG',exportLong],['WIDE',exportWide]] as const)(
    '%s revalidates changed objects in subsequent calls, including invalid identity values',(_format,serialize)=>{
      const {observations,expectedColumns,attendance}=fixture()
      const first=serialize(projectId,observations,attendance,expectedColumns)
      observations[0].measurement.unit='points'
      const changed=serialize(projectId,observations,attendance,expectedColumns)
      expect(changed.csv).not.toBe(first.csv)
      expect(changed.codebook).toHaveLength(first.codebook.length+1)
      observations[0].measurement.unit=undefined as never
      expect(()=>serialize(projectId,observations,attendance,expectedColumns)).toThrow(/undefined/)
    })

  it.each([['LONG',exportLong],['WIDE',exportWide]] as const)(
    '%s validates repeated shared objects instead of trusting reference identity',(_format,serialize)=>{
      let reads=0
      const shared={...measurement(),get unit(){return ++reads===1?null:undefined as never}}
      const expected={projectId,waveId:'wave-1',waveOrdinal:1,measurement:shared}
      expect(()=>serialize(projectId,[],[],[expected,expected])).toThrow(/undefined/)
    })

  it.each([['LONG',exportLong],['WIDE',exportWide]] as const)(
    '%s rejects every malformed identity after valid cache population',(_format,serialize)=>{
      const valid={projectId,waveId:'wave-1',waveOrdinal:1,measurement:measurement()}
      const cyclic:Record<string,unknown>={};cyclic.self=cyclic
      for(const value of [undefined,NaN,Infinity,1n,Symbol('unit'),()=>null,new Date(instant),cyclic]){
        const invalid={...valid,measurement:{...measurement(),unit:value as never}}
        expect(()=>serialize(projectId,[],[],[valid,invalid])).toThrow()
        const observation={...fixture().observations[0],measurement:invalid.measurement}
        expect(()=>serialize(projectId,[observation],[],[valid])).toThrow()
      }
    })

  it('keeps sanitized-name collisions separate and preserves duplicate Wide rejection',()=>{
    const {observations}=fixture()
    const first=observations[0]
    const distinct={...first,measurement:{...first.measurement,instrumentKey:'scale_a'}}
    const result=exportWide(projectId,[first,distinct])
    expect(result.codebook).toHaveLength(2)
    expect(result.codebook[0].column).not.toBe(result.codebook[1].column)
    expect(()=>exportWide(projectId,[first,{...first}])).toThrow(/Duplicate project code/)
  })

  it('preserves last-wins metadata and duplicate rejection even for truncated-digest collisions',()=>{
    const {observations,expectedColumns}=fixture()
    const first=expectedColumns[0]
    const second={...first,waveId:'wave-collision',measurement:{...first.measurement,instrumentKey:'scale_a'}}
    const collide=()=>vi.mocked(canonicalHash)
      .mockImplementationOnce(()=>'c'.repeat(64)).mockImplementationOnce(()=>'c'.repeat(64))
    collide()
    const result=exportWide(projectId,[],[],[first,second])
    expect(result.codebook).toHaveLength(1)
    expect(result.codebook[0]).toMatchObject({waveId:'wave-collision',instrumentKey:'scale_a'})
    expect(encodings()).toBe(2)
    expect(measurementHashes()).toBe(2)
    const row=observations[0]
    collide()
    expect(()=>exportWide(projectId,[row,
      {...row,measurement:{...row.measurement,instrumentKey:'scale_a'}},
    ])).toThrow(/Duplicate project code/)
  })

  it('retains first-insertion codebook order, last-observation wave metadata and missingness bytes',()=>{
    const {observations,expectedColumns}=fixture()
    const columns=[expectedColumns[1],expectedColumns[0],
      {...expectedColumns[0],waveId:'wave-alias'}]
    const rows=[{...observations[0],waveId:'wave-last',waveOrdinal:1,
      value:99,missingReason:'REFUSED' as const},
    {...observations[2],waveId:'wave-first',waveOrdinal:1,value:null}]
    const attendance=[
      {researchCode:'R-empty',waveId:'wave-last',status:'QUALITY_EXCLUDED'},
      {researchCode:'R-start',waveId:'wave-last',status:'STARTED'},
    ]
    const long=exportLong(projectId,rows,attendance,columns)
    const wide=exportWide(projectId,rows,attendance,columns)
    expect(long.codebook.map(x=>x.scoreKey)).toEqual(['part','total'])
    expect(long.codebook[1].waveId).toBe('wave-last')
    expect(wide.codebook.find(x=>x.scoreKey==='total')!.waveId).toBe('wave-last')
    expect.soft(artifactDigest(long)).toBe('d99780be28edbc2dc8229e9cd3f1179e554b9c61964250c3033483753badc6d9')
    expect.soft(artifactDigest(wide)).toBe('c9df844d79d632401e1b033ef497ad6fab510277f8d56c681f437f2becd5d3c7')
    expect(wide.csv).toContain('SHOWN_MISSING')
    expect(wide.csv).toContain('REFUSED')
    expect(wide.csv).toContain('QUALITY_EXCLUDED')
    expect(wide.csv).toContain('ABANDONED')
  })
})
