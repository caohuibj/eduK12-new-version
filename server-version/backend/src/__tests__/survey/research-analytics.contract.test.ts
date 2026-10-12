import { describe, expect, it } from 'vitest'
import { pairedDescriptive, summarizeWaveScores, type FrozenScoreObservation } from '../../modules/survey/analytics.cohorts'
import { exportLong, exportWide, protectCsvCell, tableToCsv, surveyAttemptCode } from '../../modules/survey/analytics.export-format'
import { describeWave,describeWaveGroups } from '../../modules/survey/analytics.descriptive'
import { rawLongExport,rawWideExport } from '../../modules/survey/analytics.raw-export'
import type { SurveySourceProjection } from '../../modules/survey/analytics.source'

const project='study-a'
const metric={instrumentKey:'motivation',scoreKey:'total',scoringDigest:'a'.repeat(64),
  responseSignature:'b'.repeat(64),respondentType:'participant_self_report',unit:null}
const observed=(code:string,waveId:string,ordinal:number,value:number):FrozenScoreObservation=>({
  projectId:project,waveId,waveOrdinal:ordinal,attemptId:code+waveId,
  researchCode:code,sourceFinalHash:'c'.repeat(64),sourceVerified:true,
  measurement:metric,value,missingReason:null,completedAt:'2026-10-11T00:00:00Z',
})
const data=()=>[
  observed('R-A','T1',1,10),observed('R-B','T1',1,12),observed('R-C','T1',1,15),
  observed('R-A','T2',2,13),observed('R-B','T2',2,14),observed('R-D','T2',2,8),
]
describe('Survey longitudinal export and matched descriptive contracts',()=>{
  it('exports pseudonymous SCORE_LONG attempt codes, never internal Attempt PKs',()=>{
    const record=observed('R-A','T1',1,10)
    const score=exportLong(project,[record])
    const pseudonym=surveyAttemptCode(record.attemptId)
    expect(pseudonym).toMatch(/^A-[A-F0-9]{20}$/)
    expect(score.csv.split('\r\n')[0]).toContain('"attempt_code"')
    expect(score.csv.split('\r\n')[0]).not.toContain('"attempt_id"')
    expect(score.csv).toContain(pseudonym)
    expect(score.csv).not.toContain('"'+record.attemptId+'"')
    const anonymous=exportLong(project,[{...record,researchCode:null}])
    expect(anonymous.csv).toContain(pseudonym)
    expect(anonymous.csv).not.toContain(record.attemptId)
  })
  it('uses real matched participants, not difference of all-wave means',()=>{
    const d=pairedDescriptive({projectId:project,baselineWaveId:'T1',followupWaveId:'T2',
      instrumentKey:'motivation',scoreKey:'total',observations:data()})
    expect(d).toMatchObject({
      baselineN:3,followupN:3,matchedN:2,attritionN:1,
      lateJoinN:1,meanPairedChange:2.5,comparability:'COMPARABLE',
    })
    expect(summarizeWaveScores(project,'T1',data())).toMatchObject({finished:3,distinctResearchCodes:3})
  })
  it('forbids merging different scored versions and cross-project data',()=>{
    const different=data()
    different[3]={...different[3],measurement:{...metric,scoringDigest:'f'.repeat(64)}}
    expect(pairedDescriptive({projectId:project,baselineWaveId:'T1',followupWaveId:'T2',
      instrumentKey:'motivation',scoreKey:'total',observations:different}))
      .toMatchObject({matchedN:2,comparability:'NOT_COMPARABLE',meanPairedChange:null})
    different[1]={...different[1],projectId:'other-project'}
    expect(()=>pairedDescriptive({projectId:project,baselineWaveId:'T1',followupWaveId:'T2',
      instrumentKey:'motivation',scoreKey:'total',observations:different})).toThrow()
  })
  it('keeps SINGLE_UNLINKED observations incompatible with wide/matched data',()=>{
    const d=data().map(o=>({...o,researchCode:null}))
    expect(()=>exportWide(project,d)).toThrow(/SINGLE_UNLINKED/)
    expect(()=>pairedDescriptive({projectId:project,baselineWaveId:'T1',followupWaveId:'T2',
      instrumentKey:'motivation',scoreKey:'total',observations:d})).toThrow()
    expect(exportLong(project,d).manifest.rowCount).toBe(6)
  })
  it('produces deterministic, addressable Long/Wide codebook and missing cells',()=>{
    const long=exportLong(project,data())
    expect(long.manifest).toMatchObject({format:'LONG',rowCount:6,columnCount:12})
    expect(long.codebook).toHaveLength(2)
    const wide=exportWide(project,data())
    expect(wide.manifest).toMatchObject({format:'WIDE',rowCount:4,columnCount:5})
    expect(wide.codebook).toHaveLength(2)
    expect(wide.csv).toContain('"R-C"')
    expect(wide.csv).toContain('"R-D"')
    const missing=data()
    missing[0]={...missing[0],value:null,missingReason:'NOT_COMPARABLE'}
    const wideMissing=exportWide(project,missing)
    expect(wideMissing.csv).toContain('"NOT_COMPARABLE"')
    const withAbandoned=exportWide(project,data(),[
      {researchCode:'R-NEW',waveId:'T1',status:'STARTED'},
    ])
    expect(withAbandoned.csv).toContain('"R-NEW"')
    expect(withAbandoned.csv).toContain('"ABANDONED"')
    // The C T2 and D T1 fields remain explicit blanks, NEVER numeric zero.
    const noT2=wide.csv.split('\r\n').find(row=>row.startsWith('"R-C",'))
    const noT1=wide.csv.split('\r\n').find(row=>row.startsWith('"R-D",'))
    expect(noT2).toContain(',"","NO_WAVE"')
    expect(noT1).toContain(',"","NO_WAVE"')
  })
  it('preserves zero-FINAL T2 columns and ABANDONED versus NO_WAVE in both Wide formats',()=>{
    const dictionary=(waveId:string,ordinal:number)=>{
      const columnKey='W'+String(ordinal).padStart(3,'0')+'__scale__itemone__abcdef1234567890'
      return {
        columnKey,waveId,waveOrdinal:ordinal,instrumentKey:'motivation',itemKey:'itemone',
        kind:'SCALE' as const,responseType:'LIKERT',title:'学习动机',prompt:'我愿意学习',
        options:[{code:'five',label:'非常同意'}],definitionDigest:'a'.repeat(64),
        scoringDigest:'b'.repeat(64),publicationVersion:ordinal,instrumentRevision:0,
      }
    }
    const t1=dictionary('T1',1),t2=dictionary('T2',2)
    const attendance=[
      {researchCode:'R-A',waveId:'T1',status:'COMPLETED'},
      {researchCode:'R-A',waveId:'T2',status:'STARTED'},
      {researchCode:'R-B',waveId:'T2',status:'STARTED'},
    ]
    const one=observed('R-A','T1',1,10)
    const source:SurveySourceProjection={
      projectId:project,collectionMode:'LINKED_WAVES',completeAttempts:1,
      sourceRevision:0,cutOff:'2026-10-11T00:00:00Z',
      scores:[one],
      scoreColumns:[
        {projectId:project,waveId:'T1',waveOrdinal:1,measurement:metric},
        {projectId:project,waveId:'T2',waveOrdinal:2,measurement:metric},
      ],
      raw:[{
        projectId:project,waveId:'T1',waveOrdinal:1,attemptId:one.attemptId,
        researchCode:'R-A',sourceFinalHash:one.sourceFinalHash,
        instrumentKey:'motivation',kind:'SCALE',responseType:'LIKERT',
        itemKey:'itemone',columnKey:t1.columnKey,publicationVersion:1,
        value:'five',missingReason:null,completedAt:one.completedAt,sourceVerified:true,
      }],
      codebook:[t1,t2],attendance,
    }
    const raw=rawWideExport(project,source)
    const score=exportWide(project,source.scores,source.attendance,source.scoreColumns)
    const longRaw=rawLongExport(project,source)
    // Historical frozen Scale had no timing protocol: NULL ms is deliberately
    // NOT_COLLECTED, not a zero millisecond response or a failed timer.
    expect(longRaw.csv).toContain('"NOT_COLLECTED"')
    expect(longRaw.csv).toContain('"first_response_ms"')
    const longScore=exportLong(project,source.scores,source.attendance,source.scoreColumns)
    for(const long of [longRaw,longScore]){
      expect(long.manifest.rowCount).toBe(4)
      expect(long.csv).toContain('NO_WAVE')
      expect(long.csv).toContain('ABANDONED')
      expect(long.codebook).toHaveLength(2)
    }
    for(const result of [raw,score]){
      expect(result.manifest.rowCount).toBe(2)
      expect(result.manifest.columnCount).toBe(5)
      expect(result.codebook).toHaveLength(2)
      const first=result.csv.split('\r\n').find(row=>row.startsWith('"R-A",'))
      const late=result.csv.split('\r\n').find(row=>row.startsWith('"R-B",'))
      expect(first).toContain('"ABANDONED"')
      expect(late).toContain('"NO_WAVE"')
      expect(late).toContain('"ABANDONED"')
    }
    expect(()=>exportWide(project,source.scores,source.attendance,[
      {projectId:'foreign-project',waveId:'T2',waveOrdinal:2,measurement:metric},
    ])).toThrow(/authorized project/)
  })
  it('refuses apparent measurement comparability without any matched respondent',()=>{
    const rows=[observed('R-C','T1',1,7),observed('R-D','T2',2,9)]
    const columns=[
      {projectId:project,waveId:'T1',measurement:metric},
      {projectId:project,waveId:'T2',
        measurement:{...metric,responseSignature:'different'}},
    ]
    const result=pairedDescriptive({
      projectId:project,baselineWaveId:'T1',followupWaveId:'T2',
      instrumentKey:'motivation',scoreKey:'total',observations:rows,
      expectedColumns:columns,
    })
    expect(result).toMatchObject({matchedN:0,comparability:'NOT_COMPARABLE',
      meanPairedChange:null})
    expect(result.reason).toMatch(/没有共同/)
  })
  it('suppresses small Form categories while grouping verified scores',()=>{
    const dictionary={
      columnKey:'W001__form__cohort',waveId:'T1',waveOrdinal:1,instrumentKey:'demographics',
      itemKey:'cohort',kind:'FORM' as const,responseType:'SINGLE',
      title:'安全分组',prompt:'研究组别',options:[
        {code:'a',label:'A组'},{code:'b',label:'B组'},{code:'c',label:'C组'}],
      definitionDigest:'a'.repeat(64),scoringDigest:null,
      publicationVersion:1,instrumentRevision:0,
    }
    const raw=Array.from({length:12},(_,i)=>({
      projectId:project,waveId:'T1',waveOrdinal:1,attemptId:'P'+i,
      researchCode:'R-'+i,sourceFinalHash:'f'.repeat(64),
      instrumentKey:'demographics',kind:'FORM' as const,responseType:'SINGLE',
      itemKey:'cohort',columnKey:dictionary.columnKey,publicationVersion:1,
      value:i<5?'a':i<10?'b':'c',missingReason:null,
      completedAt:'2026-10-11T00:00:00Z',sourceVerified:true as const,
    }))
    const scores=raw.map((r,i)=>({
      projectId:project,waveId:'T1',waveOrdinal:1,attemptId:r.attemptId,
      researchCode:r.researchCode,sourceFinalHash:r.sourceFinalHash,sourceVerified:true as const,
      measurement:metric,value:i<5?1:i<10?3:5,missingReason:null,
      completedAt:r.completedAt,
    }))
    const source:SurveySourceProjection={
      projectId:project,collectionMode:'LINKED_WAVES',completeAttempts:12,
      sourceRevision:0,cutOff:'2026-10-11T00:00:00Z',
      raw,codebook:[dictionary],scores,scoreColumns:[],attendance:[],
    }
    const grouped=describeWaveGroups(source,{waveId:'T1',groupInstrumentKey:'demographics',
      groupItemKey:'cohort',scoreInstrumentKey:'motivation',scoreKey:'total'})
    expect(grouped.groups).toHaveLength(2)
    expect(grouped.groups).toMatchObject([
      {optionCode:'a',respondentN:5,mean:1},
      {optionCode:'b',respondentN:5,mean:3},
    ])
    expect(grouped.suppressedGroups).toBe(1)
    expect(grouped.groups.some(g=>g.optionCode==='c')).toBe(false)
    expect(()=>describeWaveGroups(source,{waveId:'T1',groupInstrumentKey:'demographics',
      groupItemKey:'not-a-group',scoreInstrumentKey:'motivation',scoreKey:'total'})).toThrow()
  })
  it('protects quoted text and dangerous spreadsheet formulas',()=>{
    expect(protectCsvCell('=HYPERLINK("https://evil.example")')).toMatch(/^'/)
    expect(protectCsvCell('  -10+2')).toMatch(/^'/)
    expect(protectCsvCell('@cmd')).toMatch(/^'/)
    const output=tableToCsv(['text'],[['=1+1'],['hello"\nworld']],10)
    expect(output).toContain("'=1+1")
    expect(output).toContain('hello""\nworld')
    expect(()=>tableToCsv(['a'],[['x','y']])).toThrow()
  })
  it('counts SJT multi-select choices independently from exact response combinations',()=>{
    const codebook={
      columnKey:'W001__sjt__first__aabb',waveId:'T1',waveOrdinal:1,
      instrumentKey:'sjt',itemKey:'first',kind:'SJT' as const,
      responseType:'SJT_MULTIPLE',title:'团队合作',
      prompt:'你会采取哪些行动？',
      options:[{code:'a',label:'倾听'},{code:'b',label:'支持'}],
      definitionDigest:'d'.repeat(64),scoringDigest:'e'.repeat(64),
      publicationVersion:1,instrumentRevision:0,
    }
    const raw=(attemptId:string,value:string)=>({
      projectId:project,waveId:'T1',waveOrdinal:1,attemptId,
      researchCode:'R-'+attemptId,sourceFinalHash:'f'.repeat(64),
      instrumentKey:'sjt',kind:'SJT' as const,responseType:'SJT_MULTIPLE',
      itemKey:'first',columnKey:codebook.columnKey,publicationVersion:1,
      value,missingReason:null,completedAt:'2026-10-11T00:00:00Z',sourceVerified:true as const,
    })
    const source:SurveySourceProjection={
      projectId:project,collectionMode:'LINKED_WAVES',
      completeAttempts:2,sourceRevision:0,cutOff:'2026-10-11T00:00:00Z',
      scores:[],scoreColumns:[],raw:[raw('A','["a","b"]'),raw('B','["b"]')],
      codebook:[codebook],attendance:[],
    }
    const desc=describeWave(source,'T1')
    expect(desc.items[0]).toMatchObject({
      respondentN:2,responseType:'SJT_MULTIPLE',
      frequencies:[{value:'a',count:1},{value:'b',count:2}],
      combinationFrequencies:[
        {value:'["a","b"]',count:1},{value:'["b"]',count:1},
      ],
    })
    source.raw[0]={...source.raw[0],value:'["a","a"]'}
    expect(()=>describeWave(source,'T1')).toThrow(/duplicate|重复|invalid/)
  })

})
