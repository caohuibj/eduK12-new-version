import {beforeEach,describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const m=vi.hoisted(()=>({source:vi.fn(),issuer:vi.fn(),policy:vi.fn()}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({readEducationAssessmentDeliveryIdentity:m.source,
 EducationAssessmentSourceError:class extends Error{constructor(readonly code:string){super(code)}}}))
vi.mock('../../modules/education-tools/assessment-resource.authority',()=>({assertEducationDeliveryIssuerCurrent:m.issuer}))
vi.mock('../../modules/assessment-run/resourceAuthority',()=>({relationalEntryToRunPolicy:m.policy}))
import {assertEducationAssessmentExecutionSource} from '../../modules/assessment-run/educationAssessmentExecution'
function fixture(){
 const policy={family:'COGNITIVE',key:'education-assessment:TEACHER:org:source',version:'1.0.0',runtimeLaunchTarget:{kind:'COMPOSITE',ref:'runtime'}}
 const row={organizationId:'org',key:policy.key,version:policy.version,family:policy.family,policy,policyHash:canonicalHash(policy),school:false,teacher:true,subjectRole:'TEACHER',respondentRole:'TEACHER',relationship:'SELF',perspective:'SELF_REPORT',subjectId:'person',respondentId:'person',binding:null as string|null,boundComposite:null as string|null}
 const source={origin:{organizationId:'org',product:'TEACHER',family:'COGNITIVE',resourceId:'source',units:[{measurement:{releaseId:'measurement'}}]},runtime:{id:'runtime'},entry:{},authority:[{kind:'PRODUCT_ADMIN',actorId:'original'}],releases:new Map([['measurement',{status:'PUBLISHED'}]])}
 m.source.mockResolvedValue(source);m.policy.mockReturnValue(policy);m.issuer.mockResolvedValue(undefined)
 const db={$queryRaw:vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{status:'PUBLISHED'}])}
 const input={executionId:'execution',compositeId:'runtime',purpose:'NEW_START' as const}
 return {row,source,db,input,run:()=>assertEducationAssessmentExecutionSource(db as never,input)}
}
beforeEach(()=>vi.clearAllMocks())
describe('education execution exact-source admission versus frozen continuation',()=>{
 it('checks source lifecycle and original issuer inside the supplied transaction before a new START',async()=>{
  const f=fixture();await expect(f.run()).resolves.toBe(f.source)
  expect(m.source).toHaveBeenCalledWith(f.db,{resourceKey:f.row.key,version:'1.0.0',purpose:'HISTORY'})
  expect(m.issuer).toHaveBeenCalledWith(f.db,{proof:f.source.authority[0],organizationId:'org',product:'TEACHER'})
 })
 it.each(['workflow','subject','role','binding','policy'])('refuses a substituted %s binding',async kind=>{
  const f=fixture()
  if(kind==='workflow')f.row.school=true
  if(kind==='subject')f.row.subjectId='another'
  if(kind==='role')f.row.respondentRole='STUDENT'
  if(kind==='binding')f.row.binding='already-bound'
  if(kind==='policy')f.row.policyHash='bad'
  await expect(f.run()).rejects.toThrow('EXECUTION_BINDING')
  expect(m.issuer).not.toHaveBeenCalled()
 })
 it('refuses retired source and unavailable measurement only for new admission',async()=>{
  const f=fixture();f.db.$queryRaw.mockReset().mockResolvedValueOnce([f.row]).mockResolvedValueOnce([{status:'RETIRED'}])
  await expect(f.run()).rejects.toThrow('EXECUTION_BINDING')
  const g=fixture();g.source.releases.get('measurement')!.status='REVOKED'
  await expect(g.run()).rejects.toThrow('EXECUTION_BINDING')
 })
 it('keeps an actually bound parent identity without substituting a new issuer check',async()=>{
  const f=fixture();f.row.binding='attempt';f.row.boundComposite='runtime';m.issuer.mockRejectedValue(new Error('original grant revoked'))
  await expect(assertEducationAssessmentExecutionSource(f.db as never,{...f.input,purpose:'FROZEN'})).resolves.toBe(f.source)
  expect(m.issuer).not.toHaveBeenCalled();expect(f.db.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('does not grant frozen continuation to an unbound or different parent',async()=>{
  const f=fixture();await expect(assertEducationAssessmentExecutionSource(f.db as never,{...f.input,purpose:'FROZEN'})).rejects.toThrow('EXECUTION_BINDING')
  const g=fixture();g.row.binding='attempt';g.row.boundComposite='wrong'
  await expect(assertEducationAssessmentExecutionSource(g.db as never,{...g.input,purpose:'FROZEN'})).rejects.toThrow('EXECUTION_BINDING')
 })
})
