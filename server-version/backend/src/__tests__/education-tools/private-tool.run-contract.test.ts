import {describe,it,expect} from 'vitest'
import {privateRunTrackInput,assertPrivateRunSelection} from '../../modules/education-tools/private-tool.run-contract'
const base={expectedVersion:1,privateScale:{versionId:'00000000-0000-4000-8000-000000000001',contentHash:'a'.repeat(64),administration:{population:'STUDENT',responseMode:'SELF'}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}}
const valid=(v:unknown)=>assertPrivateRunSelection(privateRunTrackInput.parse(v))
describe('Private fixed-version draft request',()=>{
 it('requires CAS and exact version hash without accepting a resource or authority body',()=>{
  expect(()=>valid(base)).not.toThrow()
  for(const v of [{...base,expectedVersion:undefined},{...base,resource:{family:'SCALE',key:'other',version:'1'}},{...base,requestedPolicy:{}},{...base,privateOrigin:{}},{...base,report:{audience:'teacher'}},{...base,privateScale:{...base.privateScale,ownerUserId:'other'}}])
   expect(()=>valid(v)).toThrow()
 })
 it('requires canonical parent respondent and never parent subject',()=>{
  const parent={...base,privateScale:{...base.privateScale,administration:{population:'STUDENT',responseMode:'PARENT_REPORT'}}}
  expect(()=>valid(parent)).toThrow('SELECTOR_COMBINATION')
  expect(()=>valid({...parent,respondentSelector:{kind:'RELATED_PARENT'}})).not.toThrow()
  expect(()=>valid({...base,subjectSelector:{kind:'RELATED_PARENT'}})).toThrow('SELECTOR_COMBINATION')
  expect(()=>valid({...base,respondentSelector:{kind:'RELATED_PARENT'}})).toThrow('SELECTOR_COMBINATION')
 })
 it('requires explicit class target only for teacher observer and rejects course',()=>{
  const teacher={...base,privateScale:{...base.privateScale,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}}}
  expect(()=>valid(teacher)).toThrow('TARGET_REQUIRED')
  expect(()=>valid({...teacher,targetPolicy:{mode:'HOMEROOM_TEACHER'}})).not.toThrow()
  expect(()=>valid({...teacher,targetPolicy:{mode:'COURSE_TEACHER',courseId:'x'}})).toThrow()
  expect(()=>valid({...base,targetPolicy:{mode:'HOMEROOM_TEACHER'}})).toThrow('TARGET_REQUIRED')
 })
 it('requires selected teacher IDs exactly for selected-class mode',()=>{
  const teacher={...base,privateScale:{...base.privateScale,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}}}
  expect(()=>valid({...teacher,targetPolicy:{mode:'SELECTED_CLASS_TEACHERS'}})).toThrow('TARGET_SELECTION')
  expect(()=>valid({...teacher,targetPolicy:{mode:'SELECTED_CLASS_TEACHERS',teacherMembershipIds:[base.privateScale.versionId]}})).not.toThrow()
  expect(()=>valid({...teacher,targetPolicy:{mode:'HOMEROOM_TEACHER',teacherMembershipIds:[base.privateScale.versionId]}})).toThrow('TARGET_SELECTION')
 })
 it('rejects arbitrary selectors, extra user role facts and empty membership lists',()=>{
  for(const respondentSelector of [{kind:'EXTERNAL_USER',userId:'x'},{kind:'ALL_CURRENT',role:'HOMEROOM'},{kind:'MEMBERSHIP_IDS',membershipIds:[]}])expect(()=>valid({...base,respondentSelector})).toThrow()
 })
})
