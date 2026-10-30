import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {describe,it,expect} from 'vitest'
import {draftEducationAssessmentEntry,educationAssessmentOriginSchema} from '../../modules/education-tools/assessment-resource.contract'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pointer={releaseId:id(5),contentHash:'a'.repeat(64)}
const origin={schemaVersion:1,adapterVersion:'1.0.0',resourceId:id(1),product:'TEACHER',organizationId:id(2),family:'COGNITIVE',
 sourceCompositeId:id(3),runtimeCompositeId:id(4),sourceSnapshotHash:'b'.repeat(64),runtimeSnapshotHash:'c'.repeat(64),runtimeDefinitionHash:'f'.repeat(64),
 distribution:{actorId:id(9),grants:[{resourceId:id(3),grantId:id(10),version:1}]},
 units:[{itemId:id(6),family:'COGNITIVE',measurement:{...pointer,measurementHash:'d'.repeat(64)},references:[],report:null}]}
describe('education delivery identity is independent of tool publication',()=>{
 it.each(['SCHOOL','TEACHER'])('builds only a draft for exact %s product and organization',product=>{
  const entry=draftEducationAssessmentEntry({origin:{...origin,product},title:'Synthetic capability fixture',disclosure:testDisclosure()})
  expect(entry.releaseStatus).toBe('DRAFT');expect(entry.applicability.subjectRoles).toEqual([product==='TEACHER'?'TEACHER':'STUDENT'])
  expect(entry.applicability.resourceKey).toBe(`education-assessment:${product}:${id(2)}:${id(1)}`)
  expect(entry.educationOriginHash).toMatch(/^[a-f0-9]{64}$/)
 })
 it('does not reuse Training runtime identity or accept a mismatched task family',()=>{
  expect(()=>educationAssessmentOriginSchema.parse({...origin,runtimeCompositeId:origin.sourceCompositeId})).toThrow()
  expect(()=>educationAssessmentOriginSchema.parse({...origin,family:'SITUATIONAL'})).toThrow()
 })
 it('preserves explicit no-reference/no-report selection without inventing parameters',()=>{
  const entry=draftEducationAssessmentEntry({origin,title:'Synthetic',disclosure:testDisclosure()})
  expect(entry.educationOrigin.units[0].references).toEqual([]);expect(entry.educationOrigin.units[0].report).toBeNull()
 })
 it('refuses duplicates, hash ambiguity and unknown publication attributes',()=>{
  expect(()=>educationAssessmentOriginSchema.parse({...origin,family:'BUNDLE',units:[...origin.units,...origin.units]})).toThrow()
  expect(()=>educationAssessmentOriginSchema.parse({...origin,units:[{...origin.units[0],report:{...pointer,contentHash:'e'.repeat(64)}}]})).toThrow()
  expect(()=>educationAssessmentOriginSchema.parse({...origin,status:'PUBLISHED'})).toThrow()
  expect(()=>educationAssessmentOriginSchema.parse({...origin,units:[{...origin.units[0],report:pointer}]})).toThrow()
 })
 it('does not silently grant manager, parent or subject disclosure',()=>{
  for(const audience of ['TEACHER','PARENT','SUBJECT'] as const){
   const disclosure=testDisclosure();disclosure.audiences[audience]={mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}
   expect(()=>draftEducationAssessmentEntry({origin,title:'Synthetic',disclosure})).toThrow()
  }
 })
 it('accepts a configured respondent summary only as a draft, not permission to expose metrics',()=>{
  const disclosure=testDisclosure();disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['latency'],longitudinalMetricKeys:[]}
  expect(draftEducationAssessmentEntry({origin,title:'Synthetic',disclosure}).releaseStatus).toBe('DRAFT')
 })
})


it('allows a Form-only BUNDLE draft but not invented measurement feedback or empty native tools',()=>{
 const none=testDisclosure(),form={...origin,family:'BUNDLE',units:[]}
 expect(draftEducationAssessmentEntry({origin:form,title:'Synthetic form only',disclosure:none}).educationOrigin.units).toEqual([])
 const numeric=testDisclosure();numeric.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['invented'],longitudinalMetricKeys:[]}
 expect(()=>draftEducationAssessmentEntry({origin:form,title:'Synthetic',disclosure:numeric})).toThrow()
 expect(()=>educationAssessmentOriginSchema.parse({...origin,units:[]})).toThrow()
})

it('preserves exact historical origin bytes without defaulting feedback policy',()=>{
 const parsed=educationAssessmentOriginSchema.parse(origin)
 expect(parsed).not.toHaveProperty('feedbackPolicy')
 expect(canonicalHash(parsed)).toBe(canonicalHash(origin))
})
it('freezes an explicit shared feedback policy and refuses null or malformed timing',()=>{
 const policy={schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-11-01T09:00:00+09:00'}
 const parsed=educationAssessmentOriginSchema.parse({...origin,feedbackPolicy:policy})
 expect(parsed.feedbackPolicy).toEqual(policy)
 expect(canonicalHash(parsed)).not.toBe(canonicalHash(origin))
 for(const bad of [null,{schemaVersion:1,mode:'SCHEDULED',releaseAt:'tomorrow'},{schemaVersion:1,mode:'IMMEDIATE',releaseAt:'2026-11-01T00:00:00Z'}])
  expect(()=>educationAssessmentOriginSchema.parse({...origin,feedbackPolicy:bad})).toThrow()
})

it('allows an explicit own longitudinal numeric subset without changing other audiences or old origins',()=>{
 const disclosure=testDisclosure();disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['latency','accuracy'],longitudinalMetricKeys:['latency']}
 const entry=draftEducationAssessmentEntry({origin,title:'Explicit own longitudinal subset',disclosure})
 expect(entry.resultDisclosure!.audiences.RESPONDENT.longitudinalMetricKeys).toEqual(['latency'])
 expect(entry.educationOrigin).not.toHaveProperty('feedbackPolicy')
 disclosure.audiences.RESPONDENT.longitudinalMetricKeys=['unapproved']
 expect(()=>draftEducationAssessmentEntry({origin,title:'Refuse expanded subset',disclosure})).toThrow()
})
