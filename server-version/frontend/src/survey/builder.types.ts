export type Kind='FORM'|'SCALE'|'SJT'
export type Option={optionKey:string;label:string;score?:number}
export type Condition={itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string}
export type SurveyImage={
  asset:{assetId:string;contentHash:string;mimeType:'image/png'|'image/jpeg'|'image/webp'};
  altText:string;caption?:string;rightsStatus:'self_authored'|'authorized'|'unknown';rightsNote:string
}
export type SurveyPublicImage=Pick<SurveyImage,'asset'|'altText'|'caption'>
export type FormQuestion={
  itemKey:string;type:'SINGLE'|'MULTIPLE'|'SHORT_TEXT'|'LONG_TEXT'|'NUMBER'|'LIKERT'|'MATRIX';
  prompt:string;image?:SurveyImage;required:boolean;allowRefusal?:boolean;options:Option[];rows:{rowKey:string;label:string}[];
  min?:number;max?:number;maxLength?:number;displayIf?:Condition
}
export type FormDraft={schemaVersion:1;pages:{pageKey:string;title:string;questions:FormQuestion[]}[]}
export type ScaleDraft={
  schemaVersion:1;respondentType:'participant_self_report'|'student_self_report'|'teacher_self_report';
  responseOptions:{optionKey:string;label:string;score:number}[];
  dimensions:{dimensionKey:string;label:string;direction:'descriptive'|'higher_is_more'|'higher_is_better'|'higher_is_worse'|'bipolar'}[];
  aggregation:'sum'|'mean';
  items:{itemKey:string;prompt:string;required:boolean;reverse:boolean;dimensionKeys:string[]}[]
}
export type SjtDraft={
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
export type Definition=FormDraft|ScaleDraft|SjtDraft
export type ResearchDraft={
  id:string;projectId:string;instrumentKey:string;kind:Kind;title:string;
  definition:Definition;revision:number;status:'DRAFT'|'ARCHIVED';
  updatedAt:string;createdAt:string
}
export type Issue={path:string;message:string;severity:'error'|'warning'}
export const researchKey=(prefix='k')=>prefix+crypto.randomUUID().replace(/-/g,'').slice(0,18)
export const choiceTypes=new Set<FormQuestion['type']>(['SINGLE','MULTIPLE','LIKERT','MATRIX'])
export const newOption=():Option=>({optionKey:researchKey('o'),label:'新选项'})
export const newQuestion=(type:FormQuestion['type']):FormQuestion=>({
  itemKey:researchKey('q'),type,prompt:'',required:true,allowRefusal:false,
  options:choiceTypes.has(type)?[newOption(),newOption()]:[],
  rows:type==='MATRIX'?[{rowKey:researchKey('r'),label:'第一行'}]:[],
})
