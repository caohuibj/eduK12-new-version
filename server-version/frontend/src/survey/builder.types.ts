import type { FormDraft as SharedFormDraft, FormQuestion as SharedFormQuestion, Option } from '../modules/assessment-core/form/types'
export type { Option, Condition } from '../modules/assessment-core/form/types'

export type Kind='FORM'|'SCALE'|'SJT'|'COGNITIVE'
export type SurveyImage = import('../modules/assessment-media/types').AssessmentImage
export type SurveyPublicImage=Pick<SurveyImage,'asset'|'altText'|'caption'>
// Product-owned image metadata stays outside the shared Form contracts.
export type FormQuestion=SharedFormQuestion<SurveyImage>
export type FormDraft=SharedFormDraft<SurveyImage>
export type ScaleDraft={
  schemaVersion:1;presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE';respondentType:'participant_self_report'|'student_self_report'|'teacher_self_report';
  responseOptions:{optionKey:string;label:string;score:number}[];
  dimensions:{dimensionKey:string;label:string;direction:'descriptive'|'higher_is_more'|'higher_is_better'|'higher_is_worse'|'bipolar'}[];
  aggregation:'sum'|'mean';
  totalScore?:{key:string;label:string;itemKeys:string[];aggregation:'sum'|'mean'};
  rawScoreFeedback?:import('../modules/scale/rawScoreFeedback').RawScoreFeedback;
  items:{itemKey:string;prompt:string;required:boolean;reverse:boolean;dimensionKeys:string[];purpose?:'CONTENT'|'ATTENTION_CHECK'|'SOCIAL_DESIRABILITY';attentionTarget?:string}[]
}
export type SjtDraftV1={
  schemaVersion:1;respondentType:'student_self_report'|'teacher_self_report';
  scenarioKey:string;title:string;stimulus:string;image?:SurveyImage;author:string;sourceNote:string;
  licenseStatus?:'self_authored'|'authorized'|'unknown';
  redistribution:'allowed'|'restricted'|'unknown';
  metrics:{metricKey:string;label:string;direction:'descriptive'}[];
  questions:{questionKey:string;prompt:string;
    responseType?:'SINGLE'|'MULTIPLE';minSelections?:number;maxSelections?:number;
    aggregationPolicy?:'SUM'|'MEAN';
    options:{
    optionKey:string;label:string;contributions:Record<string,number>
  }[]}[]
}
export type { SjtQuestion } from '../modules/assessment-core/sjt/types'
export type SjtScene = import('../modules/assessment-core/sjt/types').SjtScene<SurveyImage>
export type SjtDraftV2 = import('../modules/assessment-core/sjt/types').SjtDraftV2<SurveyImage>
export type SjtDraft=SjtDraftV1|SjtDraftV2
export type CognitiveDraft={schemaVersion:1;templateKey:'gonogo-software-frame-v1';
  feedback:{mode:'GENERAL'|'DESCRIPTIVE';metricKeys:('hitRate'|'goMedianRtMs')[];
    release:'AFTER_FINAL'|'AFTER_COLLECTION'}}
export type Definition=FormDraft|ScaleDraft|SjtDraft|CognitiveDraft
export type ResearchDraft={
  id:string;projectId:string;instrumentKey:string;kind:Kind;title:string;
  definition:Definition;revision:number;status:'DRAFT'|'ARCHIVED';
  updatedAt:string;createdAt:string;catalogGrantId?:string|null;readOnly?:boolean;
  sourceProvenance?:import('./ResearchCatalog').CatalogProvenance
}
export type Issue={path:string;message:string;severity:'error'|'warning'}
export const researchKey=(prefix='k')=>prefix+crypto.randomUUID().replace(/-/g,'').slice(0,18)
export const choiceTypes=new Set<FormQuestion['type']>([
  'SINGLE','MULTIPLE','LIKERT','MATRIX','RANK_ORDER','CONSTANT_SUM','MATRIX_MULTIPLE'])
export const professionalTypes=new Set<FormQuestion['type']>([
  'DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE'])
export const newOption=():Option=>({optionKey:researchKey('o'),label:'新选项'})
export const newQuestion=(type:FormQuestion['type']):FormQuestion=>({
  itemKey:researchKey('q'),type,prompt:'',required:true,allowRefusal:false,
  options:choiceTypes.has(type)?[newOption(),newOption()]:[],
  rows:['MATRIX','MATRIX_MULTIPLE'].includes(type)?[{rowKey:researchKey('r'),label:'第一行'}]:[],
  ...(type==='TIME'?{timeZone:'Asia/Shanghai' as const}:{}),
  ...(type==='SLIDER'?{min:0,max:100,step:1,precision:0}:{}),
  ...(type==='CONSTANT_SUM'?{total:100,integerOnly:true}:{}),
})
