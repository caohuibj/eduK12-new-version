import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'

/** Real author/freeze/attach/publish services only. Runtime, admission, answers,
 * canonical FINAL and feedback are never inserted or repaired by the fixture. */
export async function setupTeacherCompositionExecution(db:PrismaClient){
 const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
 const context:PrivateToolContext={entry:'TEACHER',organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
 const freeze=async(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
  const draft=await tools.createPrivateTool(context,{kind,title})
  const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
  return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 const scale=(visible:boolean)=>{
  const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
   items:[{itemKey:'q',prompt:'Synthetic self reflection',required:true,reverse:false,dimensionKeys:['total']}]})
  if(visible)definition.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN'}
  definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'reflection',min:0,max:3,includeMax:true,
   text:visible?'Visible fixed reflection':'PRIVATE NONE BLOCK FEEDBACK'}]}]}
  return definition
 }
 const visible=await freeze('SCALE','Visible fixed Scale',scale(true)),form=await freeze('FORM','Unscored fixed Form',{
  schemaVersion:2,pages:[{pageKey:'p',title:'Fixed Form page',questions:[{itemKey:'comment',type:'SHORT_TEXT',prompt:'Fixed comment',required:true,options:[],rows:[]}]}]}),
  hidden=await freeze('SCALE','Hidden fixed Scale',scale(false))
 const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'Frozen ordinary questionnaire',
  blocks:[visible,form,hidden].map(source=>({blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))}
 const fixed=await freeze('COMPOSITION','One ordinary SELF questionnaire',definition)
 if(!('runtime' in fixed)||!fixed.runtime)throw new Error('Missing sealed ordinary questionnaire')
 const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId}
 await addTeacherPrivateCompositionRunTrack(teacher,{expectedVersion:f.expectedVersion,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},
  subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
 await f.open();await publishTeacherRun({...teacher,expectedVersion:f.expectedVersion+1})
 const [execution]=await f.executions()
 return {...f,executionId:execution.id,context,fixed,runtime:fixed.runtime,definition,visible,form,hidden}
}
