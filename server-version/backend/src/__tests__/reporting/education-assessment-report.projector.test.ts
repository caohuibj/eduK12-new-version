import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { educationReportFixture } from './education-assessment-report.fixture'
import { projectEducationAssessmentReports } from '../../modules/reporting/education-assessment-report.projector'

beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64)))
afterEach(()=>vi.unstubAllEnvs())
describe('education exact-version declared projection',()=>{
  it.each(['SCHOOL','TEACHER'] as const)('renders approved %s mixed-family saved facts through the shared interpreter and renderer',async product=>{
    const f=await educationReportFixture(product,['SCALE','COGNITIVE','SJT'])
    const reports=projectEducationAssessmentReports(f)
    expect(reports.map(report=>report.status)).toEqual(['READY','READY','READY'])
    expect(reports.map(report=>(report.rendered!.blocks[1] as {value:number}).value)).toEqual([10,11,12])
    expect(JSON.stringify(reports)).not.toContain('999')
    expect(JSON.stringify(reports)).not.toContain('禁止在没有阈值时出现的解释')
    expect(reports[0]).not.toHaveProperty('template')
    expect(reports[0].message).toContain('没有适用且获准的参考或阈值')
  })
  it.each(['audience','training-private','metric-withdrawn'] as const)('withholds %s without falling back to numeric facts',async change=>{
    const f=await educationReportFixture(),unit=f.origin.units[0],report=f.releases.get(unit.report!.releaseId)!
    if(report.layer!=='REPORT')throw Error('fixture')
    if(change==='audience')report.content.audience='teacher'
    if(change==='training-private')report.scope={kind:'PRIVATE',ownerId:'training-owner',product:'TRAINING',resourceId:'training-private'}
    if(change==='metric-withdrawn')f.metricKeys.clear()
    expect(projectEducationAssessmentReports(f)).toMatchObject([{status:'WITHHELD',rendered:null}])
  })
  it.each(['MEASUREMENT','REPORT'] as const)('honors current %s revocation while retaining original completion facts',async layer=>{
    const f=await educationReportFixture(),before=JSON.stringify(f.receipt)
    for(const release of f.releases.values())if(release.layer===layer)release.status='REVOKED'
    expect(projectEducationAssessmentReports(f)).toMatchObject([{status:'REVOKED',rendered:null}])
    expect(JSON.stringify(f.receipt)).toBe(before)
  })
  it('allows exact retired history but never an unselected or missing report version',async()=>{
    const f=await educationReportFixture()
    for(const release of f.releases.values())release.status='RETIRED'
    expect(projectEducationAssessmentReports(f)[0].status).toBe('READY')
    f.origin.units[0].report=null;delete f.binding.units[0].report
    expect(projectEducationAssessmentReports(f)).toMatchObject([{status:'NOT_SELECTED',rendered:null}])
  })
  it.each(['result','source','family'] as const)('rejects substituted %s identity',async change=>{
    const f=await educationReportFixture()
    if(change==='result')f.facts.get(f.origin.units[0].itemId)!.resultHash='b'.repeat(64)
    if(change==='source')f.origin.units[0].measurement={...f.origin.units[0].measurement,contentHash:'b'.repeat(64)}
    if(change==='family')f.origin.units[0].family='SJT'
    expect(()=>projectEducationAssessmentReports(f)).toThrow()
  })
})
