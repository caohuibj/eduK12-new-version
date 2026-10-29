import {afterEach,describe,expect,it,vi} from 'vitest'
import {educationCompositionOriginSchema,privateCompositionDefinitionSchema,matchesEducationCompositionRespondent} from '../../modules/education-tools/private-tool.composition-contracts'
import {assertPrivateAdministrationSelection} from '../../modules/education-tools/private-tool.run-contract'
import {studentCompositionRunPolicy,validStudentCompositionPolicy,studentCompositionSubjectCeiling} from '../../modules/huiteacher/studentComposition.policy'
import {studentCompositionRef,studentEvaluationConfigMatches,studentCompositionRequestedPolicy,assertStudentCompositionSelection,assertStudentCompositionRunUse,studentFormComparableKey} from '../../modules/huiteacher/studentCompositionResource'
import {createStudentScaleMetrics,recordStudentScaleMetrics,discloseStudentScaleMetrics} from '../../modules/huiteacher/studentComposition.reducer'
import {validateSurveyDraft} from '../../modules/survey/builder.definition'
import {formDraftSchema} from '../../modules/assessment-core/form/definition'
import {STANDARD,ENHANCED} from '../../modules/report-privacy/registry'
import {compilePrivateComposition} from '../../modules/education-tools/private-tool.composition-compiler'

afterEach(()=>vi.unstubAllEnvs())
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin=educationCompositionOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:'TEACHER',organizationId:id(1),
 ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'TEACHER:STUDENT_REPORT'})
const binding={origin,manifestHash:'b'.repeat(64),unitReports:[{blockId:id(5),versionId:id(6),contentHash:'c'.repeat(64),respondent:{mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}}]}
const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'},instruction:'Observe the assigned teacher',blocks:[]}
const metrics=(value:number|null)=>[{key:'total',value}]

describe('Student questionnaires use a separate protected Teacher observer contract',()=>{
 it('accepts the exact Teacher/student administration while rejecting reversed or SELF identities',()=>{
  expect(privateCompositionDefinitionSchema.parse(definition).administration.responseMode).toBe('STUDENT_REPORT')
  expect(educationCompositionOriginSchema.safeParse({...origin,entry:'SCHOOL'}).success).toBe(false)
  const pair={subjectUserId:id(10),respondentUserId:id(11),subjectRole:'TEACHER',respondentRole:'STUDENT',relationshipKind:'CLASS_TEACHER_STUDENT',perspective:'OBSERVER_REPORT'}
  expect(matchesEducationCompositionRespondent(origin,pair)).toBe(true)
  for(const change of [{respondentRole:'TEACHER'},{subjectRole:'STUDENT'},{perspective:'SELF_REPORT'},{relationshipKind:'SELF'},{respondentUserId:id(10)}])
   expect(matchesEducationCompositionRespondent(origin,{...pair,...change})).toBe(false)
 })
 it('binds a single verified teacher and class to the fixed version/hash, never client SELF or a broader class',()=>{
  const ref=studentCompositionRef(origin.versionId),config={formId:null,definitionDigest:null,compositionVersionId:origin.versionId,compositionContentHash:origin.contentHash}
  expect(studentEvaluationConfigMatches(config,{...ref,contentHash:origin.contentHash})).toBe(true)
  for(const change of [{key:ref.key.replace(origin.versionId,id(99))},{contentHash:'d'.repeat(64)},{version:'2.0.0'},{family:'FORM'}])
   expect(studentEvaluationConfigMatches(config,{...ref,contentHash:origin.contentHash,...change})).toBe(false)
  const selector={kind:'CLASS_UNITS' as const,classUnitIds:[id(20)]},requestedPolicy=studentCompositionRequestedPolicy(id(21)),input={subjectSelector:selector,respondentSelector:selector,requestedPolicy}
  const targetPolicy={mode:'SELECTED_CLASS_TEACHERS' as const,teacherMembershipIds:[id(21)]}
  expect(requestedPolicy.targetPolicy).toEqual(targetPolicy)
  expect(()=>assertPrivateAdministrationSelection('STUDENT_REPORT',{...input,targetPolicy})).not.toThrow()
  expect(()=>assertStudentCompositionSelection(input,{classUnitId:id(20),teacherMembershipId:id(21)})).not.toThrow()
  expect(()=>assertStudentCompositionSelection({...input,respondentSelector:{kind:'ALL_CURRENT'}},{classUnitId:id(20),teacherMembershipId:id(21)})).toThrow('SELECTION_INVALID')
  expect(()=>assertStudentCompositionSelection({...input,requestedPolicy:{...requestedPolicy,analysisMode:'INDIVIDUAL_ONLY'}},{classUnitId:id(20),teacherMembershipId:id(21)})).toThrow('SELECTION_INVALID')
  expect(()=>assertPrivateAdministrationSelection('STUDENT_REPORT',{subjectSelector:selector,respondentSelector:selector,targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})).toThrow('TARGET_SELECTION_INVALID')
  expect(studentEvaluationConfigMatches({formId:id(30),definitionDigest:'legacy',compositionVersionId:null,compositionContentHash:null},{family:'FORM',key:'huiteacher-student-form:'+id(30),version:'legacy'})).toBe(true)
 })
 it('denies an unconfigured Run before source use and requires exact author/current appointment predicates',async()=>{
  const query=vi.fn().mockResolvedValue([]),tx={$queryRaw:query} as any
  await expect(assertStudentCompositionRunUse(tx,{organizationId:id(1),runId:id(2),actorUserId:id(3),ref:studentCompositionRef(id(4))})).rejects.toMatchObject({code:'HUITEACHER_STUDENT_COMPOSITION_SCOPE_REQUIRED'})
  const sql=query.mock.calls[0][0].sql
  for(const text of ['v.owner_user_id=cfg.configured_by_user_id','staff.class_unit_id=cfg.class_unit_id',"event.kind='ASSESSMENT'","target.kind='PERSON'","persona.persona='TEACHER'","'STUDENT_REPORT'"])
   expect(sql).toContain(text)
  await expect(assertStudentCompositionRunUse(tx,{organizationId:id(1),runId:id(2),actorUserId:id(3),ref:{...studentCompositionRef(id(4)),key:'education-composition:TEACHER:'+id(4)+':TEACHER:SELF:1.0.0'}})).rejects.toMatchObject({code:'HUITEACHER_STUDENT_COMPOSITION_REQUIRED'})
  expect(query).toHaveBeenCalledTimes(1)
 })
 it('freezes group floors independently from current flags, without granting individual results',()=>{
  vi.stubEnv('REPORT_PRIVACY_TEACHER_V2_ENABLED','true');vi.stubEnv('REPORT_PRIVACY_PREFERENCES_V1_ENABLED','true')
  const policy=studentCompositionRunPolicy({origin,binding,compositeId:id(8)})
  expect(policy.minimumRespondents).toBe(5);expect(validStudentCompositionPolicy(policy)).toBe(true)
  vi.stubEnv('REPORT_PRIVACY_TEACHER_V2_ENABLED','false')
  expect(studentCompositionRunPolicy({origin,binding,compositeId:id(8)}).minimumRespondents).toBe(10)
  expect(validStudentCompositionPolicy(policy)).toBe(true)
  expect(policy.resultDisclosure?.audiences.RESPONDENT.mode).toBe('COMPLETION_ONLY')
  expect(policy.resultDisclosure?.audiences.TEACHER.mode).toBe('NONE')
  for(const change of [{minimumRespondents:4},{analysisMode:'INDIVIDUAL_ONLY' as const},{allowedTargetModes:['ALL_CLASS_TEACHERS' as const]},
   {educationComposition:{...binding,unitReports:[{...binding.unitReports[0],respondent:{mode:'INDIVIDUAL_SUMMARY' as const,metricKeys:['total'],longitudinalMetricKeys:[]}}]}}])
   expect(validStudentCompositionPolicy({...policy,...change})).toBe(false)
 })
 it('does not promote adult SELF reports, hidden scores or standard source numeric restrictions to Teacher group feedback',()=>{
  const leaf={audience:'teacher',reportRespondent:'OBSERVER_REPORT',sourceProvider:'PRIVATE_VERSION',metricKeys:['total','private'],reportScoreKeys:['total','unknown','total']}
  expect(studentCompositionSubjectCeiling(leaf)).toEqual({mode:'AGGREGATE_ONLY',metricKeys:['total'],longitudinalMetricKeys:[]})
  for(const change of [{reportRespondent:'ADULT_SELF'},{audience:'student'},{reportScoreKeys:[]},{sourceProvider:'STANDARD_SCALE',subjectNumeric:false},{sourceProvider:'unknown'}])
   expect(studentCompositionSubjectCeiling({...leaf,...change}).mode).toBe('NONE')
  expect(studentCompositionSubjectCeiling({...leaf,sourceProvider:'STANDARD_SCALE',subjectNumeric:true}).metricKeys).toEqual(['total'])
 })
 it('rejects student background collection instead of using it as the evaluated teacher context',async()=>{
  await expect(compilePrivateComposition({} as any,{entry:'TEACHER',organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL'}},
   {...definition,contextFields:[{contextKey:'birthYearMonth',formType:'year_month',formLabel:'出生年月',formOptions:[]}],blocks:[{blockId:id(5),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:id(6),contentHash:'a'.repeat(64)}}]}))
   .rejects.toMatchObject({code:'PRIVATE_COMPOSITION_STUDENT_CONTEXT_UNSUPPORTED'})
 })
 it('uses the official parsed Form digest for legacy and composition comparability',()=>{
  const form=formDraftSchema.parse({schemaVersion:2,pages:[{pageKey:'p',title:'课堂',questions:[{itemKey:'q',type:'SINGLE',prompt:'清晰吗',required:true,options:[{optionKey:'a',label:'是'},{optionKey:'b',label:'否'}],rows:[]}]}]})
  const validation=validateSurveyDraft('FORM',form)
  expect(validation.issues.filter(issue=>issue.severity==='error')).toEqual([]);expect(validation.digest).toMatch(/^[a-f0-9]{64}$/)
  expect(studentFormComparableKey(form)).toBe('FORM:'+validation.digest)
 })
})

describe('Student Scale group projection aggregates canonical facts separately for every fixed tool',()=>{
 const start=()=>createStudentScaleMetrics([{key:'total',label:'总分',displayPrecision:2}])
 it('preserves a real zero and null missingness; equal metric keys in other tools remain independent',()=>{
  const a=start(),b=start()
  for(let n=0;n<5;n++){recordStudentScaleMetrics(a,metrics(0),'valid');recordStudentScaleMetrics(b,metrics(10),'valid')}
  expect(discloseStudentScaleMetrics(a,5,5,STANDARD)[0]).toMatchObject({status:'READY',mean:0,validN:5,missingN:0})
  expect(discloseStudentScaleMetrics(b,5,5,STANDARD)[0]).toMatchObject({status:'READY',mean:10})
  recordStudentScaleMetrics(a,metrics(null),'valid')
  expect(discloseStudentScaleMetrics(a,6,5,STANDARD)[0]).toMatchObject({status:'READY',mean:0,validN:5,missingN:1})
  const withheld=discloseStudentScaleMetrics(a,6,5,{...STANDARD,protectSmallNonrespondentComplement:true})[0]
  expect(withheld).toMatchObject({status:'WITHHELD',reason:'SMALL_COMPLEMENT',mean:null});expect(withheld).not.toHaveProperty('validN')
 })
 it('withholds insufficient, policy-restricted or incomplete finals, keeping missing distinct from score zero',()=>{
  const a=start();for(let n=0;n<4;n++)recordStudentScaleMetrics(a,metrics(0),'valid')
  expect(discloseStudentScaleMetrics(a,4,5,STANDARD)[0]).toMatchObject({status:'WITHHELD',reason:'MINIMUM_N',mean:null})
  recordStudentScaleMetrics(a,metrics(9),'invalid')
  expect(a[0].values).toEqual([0,0,0,0])
  expect(discloseStudentScaleMetrics(a,6,5,STANDARD)[0]).toMatchObject({reason:'SOURCE_INTEGRITY'})
  expect(discloseStudentScaleMetrics(a,5,5,ENHANCED)[0]).toMatchObject({reason:'POLICY_RESTRICTED_STATISTICS',mean:null})
  for(const facts of [[{key:'total',value:'0'}],[{key:'total',value:Infinity}],[...metrics(1),...metrics(2)],[]])
   expect(()=>recordStudentScaleMetrics(start(),facts,'valid')).toThrow('FINAL_INTEGRITY')
 })
})
