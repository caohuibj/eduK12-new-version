import { describe, expect, it } from 'vitest'
import { pairedDescriptive, summarizeWaveScores, type FrozenScoreObservation } from '../../modules/survey/analytics.cohorts'
import { exportLong, exportWide, protectCsvCell, tableToCsv } from '../../modules/survey/analytics.export-format'

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
    // The C T2 and D T1 fields remain explicit blanks, NEVER numeric zero.
    expect(wide.csv.split('\r\n').some(row=>row.startsWith('"R-C",')&&row.endsWith(',""'))).toBe(true)
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
})
