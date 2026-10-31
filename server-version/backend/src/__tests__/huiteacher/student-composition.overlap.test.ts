import {describe,expect,it,vi} from 'vitest'
import {assertTeacherComparableDisclosure} from '../../modules/huiteacher/disclosureOverlap.service'

const hash='a'.repeat(64),formKey='FORM:'+hash,scaleKey='SCALE:'+'b'.repeat(64)
const respondents=Array.from({length:10},(_,n)=>'student-'+n)
const input={organizationId:'school',runId:'new',teacherUserId:'teacher',scenario:'TEACHER_STUDENT_EVALUATION' as const,enhanced:true,definitionDigest:hash,respondents}
describe('Student comparable history spans old Form and ordinary composition in both directions',()=>{
 it.each(['legacy-to-composition','composition-to-legacy'])('blocks small effective changes for %s',async direction=>{
  const query=vi.fn().mockResolvedValueOnce([{runId:'old',enhanced:true}]).mockResolvedValueOnce(respondents.slice(0,9).map(userId=>({runId:'old',userId})))
  const next=direction==='legacy-to-composition'?{...input,definitionDigest:'c'.repeat(64),comparableKeys:[formKey,scaleKey]}:input
  await expect(assertTeacherComparableDisclosure({$queryRaw:query} as any,next)).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
  const history=query.mock.calls[0][0],contributors=query.mock.calls[1][0]
  expect(history.sql).toContain("release.report_projection->'comparableKeys'")
  expect(history.sql).toContain('ledger.comparable_keys');expect(history.values).toContainEqual(expect.arrayContaining([formKey]))
  for(const text of ["e.runtime_binding_kind='HUITEACHER_FORM_V2'","e.runtime_binding_kind='COMPOSITE'","parent.status='COMPLETED'",
   "assignment.analysis_mode='COHORT_AGGREGATE'","cfg.composition_version_id IS NOT NULL","parent.respondent_user_id=respondent.user_id"])
   expect(contributors.sql).toContain(text)
  expect(contributors.sql).not.toContain('organization_memberships')
 })
 it('does not expand Standard-only history or compare an unrelated leaf; protected history cannot be bypassed',async()=>{
  const query=vi.fn().mockResolvedValueOnce([{runId:'old',enhanced:false}])
  await expect(assertTeacherComparableDisclosure({$queryRaw:query} as any,{...input,enhanced:false,comparableKeys:[scaleKey]})).resolves.toBeUndefined()
  expect(query).toHaveBeenCalledTimes(1)
  const disjoint=vi.fn().mockResolvedValueOnce([{runId:'old',enhanced:true}]).mockResolvedValueOnce(respondents.map(userId=>({runId:'old',userId:'other-'+userId})))
  await expect(assertTeacherComparableDisclosure({$queryRaw:disjoint} as any,{...input,enhanced:false,comparableKeys:[scaleKey]})).resolves.toBeUndefined()
  expect(disjoint).toHaveBeenCalledTimes(2)
  expect(disjoint.mock.calls[0][0].values).toContainEqual([scaleKey])
 })
 it('refuses missing/duplicate historical contributors and invalid comparability keys',async()=>{
  const query=vi.fn().mockResolvedValueOnce([{runId:'old',enhanced:true}]).mockResolvedValueOnce([])
  await expect(assertTeacherComparableDisclosure({$queryRaw:query} as any,input)).rejects.toMatchObject({code:'TEACHER_REPORT_COMPARABLE_SOURCE_INVALID'})
  const unused=vi.fn()
  await expect(assertTeacherComparableDisclosure({$queryRaw:unused} as any,{...input,comparableKeys:['wrapper-only-hash']})).rejects.toMatchObject({code:'TEACHER_REPORT_COMPARABLE_SOURCE_INVALID'})
  expect(unused).not.toHaveBeenCalled()
 })
})
