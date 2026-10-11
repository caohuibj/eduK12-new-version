import { describe, expect, it } from 'vitest'
import { pairedDescriptive, summarizeWaveScores, type FrozenScoreObservation } from '../../modules/survey/analytics.cohorts'
import { exportLong, exportWide, protectCsvCell, tableToCsv } from '../../modules/survey/analytics.export-format'
import { describeWave } from '../../modules/survey/analytics.descriptive'
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
      scores:[],raw:[raw('A','["a","b"]'),raw('B','["b"]')],
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
