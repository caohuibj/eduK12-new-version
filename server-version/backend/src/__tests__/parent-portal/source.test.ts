import { beforeEach,describe,it,expect,vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const {read}=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../modules/reporting/artifact',()=>({readReportingArtifactRecord:read}))
vi.mock('../../modules/parent-portal/publication',()=>({readParentPublication:async()=>null}))
import { readParentReportSource } from '../../modules/parent-portal/source'
const policy={key:'test-approved',version:'1',audience:'PARENT',mode:'EDUCATIONAL_SUMMARY',rawAnswers:false,itemLevel:false,researchExport:false}
function record(){return {analysisKind:'INDIVIDUAL_LONGITUDINAL',policyDomain:'ORG_INDIVIDUAL_REPORT_V1',organizationId:'org-1',snapshotHash:'a'.repeat(64),artifactPayload:{subjectUserId:'child-1',parentAudience:{schemaVersion:1,toolRef:{family:'SCALE',key:'synthetic',version:'1'},disclosedMetricKeys:[],disclosedLongitudinalMetricKeys:[],audience:'PARENT',artifactId:'artifact-1',subjectUserId:'child-1',title:'Approved summary',publicationStatus:'PUBLISHED',policy,policyHash:canonicalHash(policy),summary:'Published text',blocks:[]}}}}
// Adapter tests assume the shared immutable reader has already verified its record.
describe('parent source adapter',()=>{
 beforeEach(()=>{read.mockReset()})
 it('requires the shared verified reader and retains exact source identity',async()=>{
  read.mockResolvedValue(record());const result=await readParentReportSource('artifact-1')
  expect(read).toHaveBeenCalledWith('artifact-1');expect(result).toMatchObject({artifactId:'artifact-1',subjectUserId:'child-1',organizationId:'org-1',sourceHash:'a'.repeat(64)})
 })
 it('propagates integrity failures without creating a projection',async()=>{read.mockRejectedValue(new Error('integrity'));await expect(readParentReportSource('artifact-1')).rejects.toThrow('integrity')})
 it.each(['legacy','draft','teacher','different-subject','group','tool-missing','longitudinal-missing'])('does not reinterpret %s content as a parent report',async kind=>{
  const value=record()
  if(kind==='legacy')delete (value.artifactPayload as any).parentAudience
  if(kind==='draft')value.artifactPayload.parentAudience.publicationStatus='DRAFT'
  if(kind==='teacher')value.artifactPayload.parentAudience.audience='TEACHER'
  if(kind==='different-subject')value.artifactPayload.parentAudience.subjectUserId='other-child'
  if(kind==='longitudinal-missing')delete (value.artifactPayload.parentAudience as any).disclosedLongitudinalMetricKeys
  if(kind==='tool-missing')delete (value.artifactPayload.parentAudience as any).toolRef
  if(kind==='group')value.analysisKind='GROUP'
  read.mockResolvedValue(value);await expect(readParentReportSource('artifact-1')).rejects.toMatchObject({status:404})
 })
})
