import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>{process.env.DATA_ENCRYPTION_KEY='b'.repeat(64);return {identity:vi.fn(),reader:vi.fn(),results:vi.fn()}})
vi.mock('../../modules/assessment-run/educationCompositionExecution',()=>({readFrozenCompositionIdentity:m.identity}))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({createStoredScaleFactsReader:m.reader,loadStoredCanonicalUnitResults:m.results}))
import {collectStudentCompositionFinals} from '../../modules/huiteacher/studentComposition.report'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {createPolicyFormSectionCollectionFacts} from '../../modules/assessment-runtime/form-facts'
import {studentFormComparableKey} from '../../modules/huiteacher/studentCompositionResource'
import {STANDARD} from '../../modules/report-privacy/registry'
import type {FormDraft} from '../../modules/assessment-core/form/definition'

const form:FormDraft={schemaVersion:2,pages:[{pageKey:'p',title:'Classroom',questions:[
 {itemKey:'q',prompt:'Clarity',type:'SINGLE',required:true,options:[{optionKey:'yes',label:'Clear'},{optionKey:'no',label:'Unclear'}],rows:[]},
 {itemKey:'note',prompt:'Private note',type:'SHORT_TEXT',required:false,options:[],rows:[]},
]}]}
const version='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64),nativeHash='b'.repeat(64),runtimeHash='c'.repeat(64),manifestHash='d'.repeat(64)
const scaleBlock={blockId:'visible',kind:'SCALE',versionId:'scale-v',contentHash:hash,itemIds:['scale'],sectionIds:[],title:'Visible Scale'},
 formBlock={blockId:'form',kind:'FORM',versionId:'form-v',contentHash:hash,itemIds:['question','comment'],sectionIds:['section'],title:'Unscored Form'},
 hiddenBlock={blockId:'hidden',kind:'SCALE',versionId:'hidden-v',contentHash:hash,itemIds:['hidden'],sectionIds:[],title:'Private Scale'}
const ceiling=(blockId:string,versionId:string,allowed:boolean)=>({blockId,versionId,contentHash:hash,respondent:{mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},
 subject:{mode:allowed?'AGGREGATE_ONLY':'NONE',metricKeys:allowed?['total']:[],longitudinalMetricKeys:[]}})
const input={organizationId:'org',runId:'run',teacherUserId:'teacher',versionId:version,contentHash:hash,count:5,minimum:5,options:STANDARD}
const frozen=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[
 {slotKey:'scale:scale',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale',version:'1',hash:nativeHash},sourceBinding:{compositeItemId:'scale'}},
 {slotKey:'form-section:section',unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:'form',version:'1',hash},sourceBinding:{sectionId:'section'}},
]})
function fixture(definition:FormDraft=form){
 const parents=Array.from({length:5},(_,n)=>({id:'parent-'+n,userId:'student-'+n,subjectUserId:'teacher',respondentUserId:'student-'+n,attemptEpoch:1,
  contextSnapshotHash:null,frozenSlots:encryptFrozenActiveSlotSet(frozen),frozenSlotsHash:frozen.snapshotHash}))
 const sections=parents.map(parent=>({id:parent.id+'-section',attemptId:parent.id,attemptEpoch:1,sectionId:'section',submissionId:parent.id+'-form-submit'}))
 const children=parents.map(parent=>({id:parent.id+'-child',compositeAttemptId:parent.id,compositeItemId:'scale',attemptEpoch:1,scaleId:'native-scale',status:'COMPLETED',
  subjectUserId:'teacher',userId:parent.userId,respondentUserId:parent.userId,submissionId:parent.id+'-scale-submit',compiledRuntimeHash:runtimeHash}))
 const finals=parents.flatMap((parent,n)=>[
  {compositeAttemptId:parent.id,attemptEpoch:1,slotKey:'scale:scale',unitType:'SCALE',sourceAttemptId:children[n].id,sourceSubmissionId:children[n].submissionId,
   sourceDefinitionHash:nativeHash,compiledRuntimeHash:runtimeHash,canonicalResultEncrypted:'opaque-canonical-'+n},
  {compositeAttemptId:parent.id,attemptEpoch:1,slotKey:'form-section:section',unitType:'FORM_SECTION',sourceAttemptId:sections[n].id,sourceSubmissionId:sections[n].submissionId,sourceDefinitionHash:hash,
   collectionFactsEncrypted:encryptUnifiedRuntimePayload(createPolicyFormSectionCollectionFacts({sectionKey:'section',items:[
    {key:'question',label:'Clarity',state:'ANSWERED',value:'yes'},{key:'comment',label:'Private note',state:'ANSWERED',value:'PRIVATE identifiable text'},
   ]}))},
 ])
 const canonical=children.map(child=>({core:{unitType:'SCALE',sourceDefinitionHash:nativeHash,compiledRuntimeHash:runtimeHash,contextHash:null,metrics:[{key:'total',value:0}],quality:{status:'valid'}},
  persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:child.id,sourceSubmissionId:child.submissionId}}))
 const identity={origin:{variantKey:'TEACHER:STUDENT_REPORT',contentHash:hash},compositeId:'sealed-runtime',binding:{manifestHash,unitReports:[ceiling('visible','scale-v',true),ceiling('hidden','hidden-v',false)]},
  manifest:[scaleBlock,formBlock,hiddenBlock],units:[{itemId:'scale',scaleId:'native-scale',definitionHash:nativeHash,measurementHash:'e'.repeat(64)},{itemId:'hidden',scaleId:'private-scale',definitionHash:nativeHash,measurementHash:'f'.repeat(64)}]}
 const query=vi.fn().mockResolvedValueOnce([{key:'fixed',version:'1.0.0',policy:{},policyHash:hash}])
  .mockResolvedValueOnce([{blockId:'visible',definition:null,scores:[{key:'total',label:'Support',displayPrecision:1}]},{blockId:'form',definition,scores:null},{blockId:'hidden',definition:null,scores:[{key:'total',label:'Secret'}]}])
  .mockResolvedValueOnce(parents).mockResolvedValueOnce([])
 const tx={$queryRaw:query,assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue(finals)},compositeFormSectionAttempt:{findMany:vi.fn().mockResolvedValue(sections)},assessment:{findMany:vi.fn().mockResolvedValue(children)}}
 m.identity.mockResolvedValue(identity);m.results.mockResolvedValue(canonical);m.reader.mockResolvedValue({})
 return {parents,sections,children,finals,canonical,identity,query,tx}
}
beforeEach(()=>vi.clearAllMocks())
describe('Student composition report reads final canonical sources without scoring or personal projections',()=>{
 it('projects zero and unscored distributions from complete parents, keeps source blocks distinct and never loads a hidden Scale',async()=>{
  const f=fixture(),report=await collectStudentCompositionFinals(f.tx as any,input)
  expect(report.respondents.size).toBe(5)
  expect(report.comparableKeys).toContain(studentFormComparableKey(form))
  expect(report.units).toMatchObject([{kind:'SCALE',metrics:[{key:'total',status:'READY',mean:0,validN:5,missingN:0}]},
   {kind:'FORM',distributions:[{itemKey:'q',status:'READY',cells:[{key:'yes',count:5},{key:'no',count:0},{key:'REFUSED',count:0},{key:'MISSING',count:0}]},{itemKey:'note',status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'}]},
   {kind:'SCALE',state:'WITHHELD',reason:'AUDIENCE_NOT_ALLOWED',metrics:[]}])
  expect(JSON.stringify(report.units)).not.toMatch(/student-|PRIVATE identifiable text|sourceAttempt|opaque-canonical|canonicalResult/)
  expect(m.reader).toHaveBeenCalledTimes(1);expect(m.results).toHaveBeenCalledTimes(1)
  expect(f.tx.assessment.findMany.mock.calls[0][0].where.compositeItemId.in).toEqual(['scale'])
 })
 it('computes optional student topic means per complete respondent before protected aggregation; NA never becomes zero',async()=>{
  const described:FormDraft=structuredClone(form)
  described.pages[0].questions[1]={...structuredClone(described.pages[0].questions[0]),itemKey:'note',prompt:'Private note'}
  for(const q of described.pages[0].questions)q.options.push({optionKey:'na',label:'Not encountered'})
  described.descriptive={version:'ordinal-description-v1',selfAudience:'NONE',exploratoryMeans:true,
   items:['q','note'].map(itemKey=>({itemKey,values:[{optionKey:'yes',code:0},{optionKey:'no',code:1}],nonresponseOptionKeys:['na']})),
   groups:[{key:'topic',label:'Content topic',itemKeys:['q','note']}]}
  for(const incomplete of [false,true]){
   const f=fixture(described)
   for(const [i,final] of f.finals.filter(f=>f.unitType==='FORM_SECTION').entries())final.collectionFactsEncrypted=encryptUnifiedRuntimePayload(createPolicyFormSectionCollectionFacts({sectionKey:'section',items:[
    {key:'question',label:'Clarity',state:'ANSWERED',value:'yes'},
    {key:'comment',label:'Private note',state:'ANSWERED',value:incomplete&&i===0?'na':'no'},
   ]}))
   const report=await collectStudentCompositionFinals(f.tx as any,input),unit=report.units[1]
   expect(unit.exploratoryMeans).toMatchObject(incomplete?[{status:'WITHHELD',mean:null}]:[{status:'READY',mean:.5,validN:5,missingN:0}])
  }
 })
 it('refuses duplicate respondents, incomplete parents and an earlier epoch instead of returning partial group statistics',async()=>{
  for(const mutation of ['duplicate','incomplete','epoch']){
   const f=fixture()
   if(mutation==='duplicate')f.parents[1].userId=f.parents[0].userId
   if(mutation==='incomplete')f.parents.pop()
   if(mutation==='epoch')f.parents[0].attemptEpoch=2
   await expect(collectStudentCompositionFinals(f.tx as any,input)).rejects.toMatchObject({code:'STUDENT_COMPOSITION_REPORT_SOURCE_INTEGRITY'})
  }
 })
 it('binds each final to the actual child, submission, fixed native definition and frozen context',async()=>{
  for(const mutation of ['child','submission','context','source','label','family']){
   const f=fixture()
   if(mutation==='child')f.children[0].subjectUserId='other-teacher'
   if(mutation==='submission')f.canonical[0].persistenceProvenance.sourceSubmissionId='foreign-submit'
   if(mutation==='context')Object.assign(f.canonical[0].core,{contextHash:hash})
   if(mutation==='source')f.canonical[0].core.sourceDefinitionHash=hash
   if(mutation==='family')f.canonical[0].core.unitType='COGNITIVE'
   if(mutation==='label')f.finals[1].collectionFactsEncrypted=encryptUnifiedRuntimePayload(createPolicyFormSectionCollectionFacts({sectionKey:'section',items:[
    {key:'question',label:'A replaced question',value:'yes',state:'ANSWERED'},{key:'comment',label:'Private note',value:null,state:'SHOWN_MISSING'}]}))
   await expect(collectStudentCompositionFinals(f.tx as any,input)).rejects.toMatchObject({code:'STUDENT_COMPOSITION_REPORT_SOURCE_INTEGRITY'})
  }
 })
})
