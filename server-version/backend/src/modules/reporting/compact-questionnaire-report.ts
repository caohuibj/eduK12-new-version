import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { publicTemplates } from '../assessment-runtime/public-templates'
import { encryptCompactField } from '../assessment-runtime/compact-field-codec'
import { loadStoredCanonicalUnitResults } from '../assessment-runtime/compact-assessment-storage'

type Manifest={kind:'QUESTIONNAIRE_REPORT_FACTS';version:1;assessmentId:string;attemptEpoch:number;aggregateInputHash:string;layout:string;
 units:Array<{sourceAttemptId:string;resultHash:string}>;backgroundValues:any[]}
export const encryptCompactQuestionnaireReport=async(input:{parent:any;aggregateInputHash:string;scales:any[];report:any}):Promise<string>=>{
 const [layout]=await publicTemplates.saveMany([{kind:'COMPOSITE_REPORT_LAYOUT',value:{variant:'QUESTIONNAIRE_UNIFIED',version:1,
  questionnaireName:input.report.questionnaireName,scales:input.scales.map(s=>({itemId:s.itemId,scaleId:s.scaleId,scaleCode:s.scaleCode,scaleName:s.scaleName}))}}])
 const units=input.scales.map(s=>{if(!s.sourceAttemptId||!/^[a-f0-9]{64}$/.test(s.resultHash))throw new Error('Questionnaire result reference missing');return {sourceAttemptId:s.sourceAttemptId,resultHash:s.resultHash}})
 return encryptCompactField({kind:'QUESTIONNAIRE_REPORT_FACTS',version:1,assessmentId:input.parent.id,attemptEpoch:input.parent.attemptEpoch,
  aggregateInputHash:input.aggregateInputHash,layout,units,backgroundValues:input.report.backgroundValues} satisfies Manifest)
}
export const restoreCompactQuestionnaireReport=async(manifest:Manifest,qa:any,build:(input:any)=>any):Promise<any>=>{
 if(manifest.version!==1||manifest.assessmentId!==qa.id||!Number.isSafeInteger(manifest.attemptEpoch)||manifest.attemptEpoch<1
  ||(qa.attemptEpoch!==undefined&&qa.attemptEpoch!==manifest.attemptEpoch)||(qa.aggregateInputHash!==undefined&&qa.aggregateInputHash!==manifest.aggregateInputHash)
  ||!Array.isArray(manifest.units)||manifest.units.length>1000||new Set(manifest.units.map(u=>u.sourceAttemptId)).size!==manifest.units.length)throw new Error('Questionnaire compact report binding mismatch')
 const [layout]=await publicTemplates.loadMany([{hash:manifest.layout,kind:'COMPOSITE_REPORT_LAYOUT'}])
 if(layout?.variant!=='QUESTIONNAIRE_UNIFIED'||layout.version!==1||!Array.isArray(layout.scales)||layout.scales.length!==manifest.units.length)throw new Error('Questionnaire report layout invalid')
 const ids=manifest.units.map(u=>u.sourceAttemptId)
 const rows=ids.length?await prisma.$queryRaw<Array<{sourceAttemptId:string;encrypted:string}>>`SELECT s.source_attempt_id AS "sourceAttemptId",s.canonical_result_encrypted AS encrypted
  FROM assessment_unit_snapshots s JOIN questionnaire_assessments q ON q.id=s.questionnaire_assessment_id AND q.attempt_epoch=s.attempt_epoch
  WHERE q.id=${manifest.assessmentId} AND q.attempt_epoch=${manifest.attemptEpoch} AND q.status='COMPLETED' AND q.aggregate_input_hash=${manifest.aggregateInputHash}
   AND s.source_attempt_id IN (${Prisma.join(ids)}) AND s.terminal_state='COMPLETED' AND s.payload_kind='UNIT_RESULT'`:[]
 if(rows.length!==ids.length)throw new Error('Questionnaire report result unavailable')
 const envelopes=await loadStoredCanonicalUnitResults(rows.map(row=>row.encrypted)),byId=new Map(rows.map((row,i)=>[row.sourceAttemptId,envelopes[i]]))
 const scales=manifest.units.map((unit,i)=>{const result=byId.get(unit.sourceAttemptId);if(!result||result.resultHash!==unit.resultHash)throw new Error('Questionnaire report result version mismatch');return {...layout.scales[i],completedAt:result.completedAt,totalTime:null,core:result.core,sourceAttemptId:unit.sourceAttemptId,bundleBridge:result.bundleBridge}})
 const report=build({questionnaireName:layout.questionnaireName,scales,formSections:[]})
 return {reportDefinitionVersion:'collection-only-v2',scaleReports:report.unitReports,totalDimensions:report.totalDimensions,backgroundValues:manifest.backgroundValues}
}
