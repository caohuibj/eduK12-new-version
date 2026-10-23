import {describe,it,expect,vi} from 'vitest'
import {assertEducationLibraryPopulationSupport,prelockEducationLibraryAdmissions,assertEducationLibraryAdmissionsUnchanged,lockEducationLibraryPopulationFacts} from '../../modules/assessment-run/educationLibraryPopulation'
describe('education library population selection guards',()=>{
 it('supports the actual class/parent/self lanes, not course or mixed unsupported relations',()=>{
  expect(()=>assertEducationLibraryPopulationSupport([{requestedPolicy:{relationshipKinds:['SELF','CLASS_TEACHER_STUDENT','PARENT_CHILD']}}])).not.toThrow()
  expect(()=>assertEducationLibraryPopulationSupport([{requestedPolicy:{relationshipKinds:['SELF','COURSE_TEACHER_STUDENT']}}])).toThrow('EDUCATION_LIBRARY_RELATIONSHIP_RUNTIME_NOT_READY')
  expect(()=>assertEducationLibraryPopulationSupport([{requestedPolicy:{relationshipKinds:['CLASS_TEACHER_STUDENT'],targetPolicy:{mode:'COURSE_TEACHER'}}}])).toThrow('EDUCATION_LIBRARY_RELATIONSHIP_RUNTIME_NOT_READY')
  expect(()=>assertEducationLibraryPopulationSupport([{requestedPolicy:{relationshipKinds:['SELF'],subjectRoles:['PARENT']}}])).toThrow('EDUCATION_LIBRARY_RELATIONSHIP_RUNTIME_NOT_READY')
 })
 it('prelocks selected admissions, then refuses changed selection instead of adding locks after org',async()=>{
  const query=vi.fn().mockResolvedValueOnce([{id:'class-a'}]).mockResolvedValueOnce([{id:'class-b'}])
  const tx={$queryRaw:query} as any;const scope={organizationId:'org',runId:'run'}
  const selected=await prelockEducationLibraryAdmissions(tx,scope)
  expect(query.mock.calls[0][0].sql).toContain('FOR SHARE OF ca')
  await expect(assertEducationLibraryAdmissionsUnchanged(tx,scope,selected)).rejects.toThrow('RUN_POPULATION_CHANGED_RETRY')
  expect(query.mock.calls[1][0].sql).not.toContain('FOR SHARE')
 })
 it('locks selected facts in deterministic order and never locks users or ordinary courses',async()=>{
  const query=vi.fn().mockResolvedValue([])
  await lockEducationLibraryPopulationFacts({$queryRaw:query} as any,{organizationId:'org',labelIds:['label'],additionalMemberIds:['publisher'],pairs:[{subject:{membershipId:'student'},respondent:{membershipId:null},relationshipKind:'PARENT_CHILD',facts:{parentStudentRelationshipId:'parent-link'}}]})
  const sql=query.mock.calls.map(call=>call[0].sql)
  expect(sql).toHaveLength(5)
  expect(sql[0]).toContain('organization_labels')
  expect(sql[1]).toContain('organization_label_assignments')
  expect(sql[2]).toContain('organization_staff_class_assignments')
  expect(sql[3]).toContain('organization_student_class_assignments')
  expect(sql[4]).toContain('parent_student_relationships')
  expect(sql.every(q=>q.includes('ORDER BY id FOR SHARE'))).toBe(true)
  expect(sql.join('\n')).not.toMatch(/FROM users|FROM courses/)
 })
})
