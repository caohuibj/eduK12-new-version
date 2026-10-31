import {randomUUID} from 'node:crypto'
import {expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {buildSelfGroupCohortAnalysisPolicy} from '../../modules/assessment-policy/self-group-contract'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import {readTeacherCompositionLibraryGroupChoices} from '../../modules/education-tools/teacher-composition-group-source'
import {parseSchoolPrivateGroupSelection} from '../../modules/education-tools/school-private-group-selection'
const {read}=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../modules/scale-library-governance/education-runtime-resources',()=>({readEducationLibraryRegisteredSource:read}))

it('pins independently approved library GROUP identity and N without promoting personal material-use rights',async()=>{
 const id=randomUUID(),hash='a'.repeat(64),blockId=randomUUID(),key='library-scale:'+id+':TEACHER:TEACHER:SELF:GROUP'
 const contract=testDisclosure(20);contract.policyKey='EDUCATION_SELF_GROUP_V2';contract.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['total'],longitudinalMetricKeys:[]}
 const origin={schemaVersion:1,adapterVersion:'2.0.0',entryId:id,product:'TEACHER',releaseId:randomUUID(),contentHash:'b'.repeat(64),approvedSnapshotHash:hash,sourceDefinitionHash:'c'.repeat(64),applicabilityHash:'d'.repeat(64),variantKey:'TEACHER:SELF',dependencies:[]}
 const entry={title:'Approved library source',libraryOrigin:origin,applicability:{analysisMode:'COHORT_AGGREGATE',relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],minimumRespondents:20},resultDisclosure:contract,cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(contract)}
 const row={key,version:'2.0.0',entry,hash:canonicalHash(entry)},db={$queryRaw:vi.fn().mockResolvedValue([row])} as any
 read.mockResolvedValue({resourceEntry:entry})
 const source={blockId,versionId:id,contentHash:hash}
 const catalog=await readTeacherCompositionLibraryGroupChoices(db,[source]),choice=catalog.get(blockId)!
 expect(choice).toMatchObject({minimumRespondents:20,audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']},groupPolicy:{resourceKey:key,resourceVersion:'2.0.0',entryHash:row.hash}})
 expect(read).not.toHaveBeenCalled()
 expect((await readTeacherCompositionLibraryGroupChoices(db,[source],'NEW_USE')).size).toBe(0)
 const selected={...source,groupPolicy:choice.groupPolicy}
 expect((await readTeacherCompositionLibraryGroupChoices(db,[selected],'NEW_USE')).get(blockId)).toEqual(choice)
 expect(read).toHaveBeenCalledWith(db,{product:'TEACHER',resourceKey:key,resourceVersion:'2.0.0',purpose:'NEW_USE'})
 expect(db.$queryRaw).toHaveBeenCalledTimes(1) // Catalog only; no duplicate policy-row pre-read.
 read.mockClear()
 expect((await readTeacherCompositionLibraryGroupChoices(db,[selected,{...selected,blockId:randomUUID()}],'HISTORY')).size).toBe(2)
 expect(read).toHaveBeenCalledTimes(1) // One existing validator per exact immutable approval.
 const context={entry:'TEACHER' as const,administration:{population:'TEACHER',responseMode:'SELF'},sources:[{...choice,blockId}]}
 const raw={schemaVersion:1,minimumRespondents:20,leaves:[{...selected,audiences:choice.audiences}]}
 expect(parseSchoolPrivateGroupSelection(raw,context).leaves[0].groupPolicy).toEqual(choice.groupPolicy)
 expect(()=>parseSchoolPrivateGroupSelection({...raw,minimumRespondents:10},context)).toThrow()
 expect(()=>parseSchoolPrivateGroupSelection({...raw,leaves:[{...raw.leaves[0],groupPolicy:{...choice.groupPolicy,entryHash:'e'.repeat(64)}}]},context)).toThrow()
 expect((await readTeacherCompositionLibraryGroupChoices(db,[{...selected,groupPolicy:{...choice.groupPolicy,resourceVersion:'2.0.9'}}],'HISTORY')).size).toBe(0)
 expect((await readTeacherCompositionLibraryGroupChoices(db,[{...selected,contentHash:'f'.repeat(64)}],'HISTORY')).size).toBe(0)
})
