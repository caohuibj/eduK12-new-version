import type {AssessmentMaterial} from '../../assessment-media/material'
/** Frontend-only Form contracts. Image metadata belongs to the consuming product,
 * so draft types accept it as a type parameter rather than importing product code.
 * The legacy refusal key is part of the existing answer protocol and stays intact.
 */
export type Option={optionKey:string;label:string;score?:number}
export type Condition={itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string}
export type FormQuestion<TImage>={
  itemKey:string;type:'SINGLE'|'MULTIPLE'|'SHORT_TEXT'|'LONG_TEXT'|'NUMBER'|'LIKERT'|'MATRIX'|
    'DATE'|'TIME'|'RANK_ORDER'|'SLIDER'|'CONSTANT_SUM'|'MATRIX_MULTIPLE';
  prompt:string;image?:TImage;materials?:AssessmentMaterial[];required:boolean;allowRefusal?:boolean;options:Option[];rows:{rowKey:string;label:string}[];
  min?:number;max?:number;integerOnly?:boolean;step?:number;precision?:number;
  maxLength?:number;total?:number;minSelections?:number;maxSelections?:number;
  timeZone?:'Asia/Shanghai'|'UTC';textValidation?:'EMAIL'|'DIGITS'|'ALPHANUMERIC';
  otherOptionKey?:string;otherMaxLength?:number;exclusiveOptionKeys?:string[];
  displayIf?:Condition
}
export type FormDraft<TImage>={schemaVersion:1|2;pages:{pageKey:string;title:string;description?:string;questions:FormQuestion<TImage>[]}[]}

export type ProfessionalAnswer=string|number|string[]|Record<string,number>|{_surveyRefusal:true}|null
export type ProfessionalQuestion={
  itemKey:string;type:string;prompt:string;
  options:{optionKey:string;label:string}[];
  rows?:{rowKey:string;label:string}[];
  min?:number;max?:number;step?:number;integerOnly?:boolean;
  total?:number;minSelections?:number;maxSelections?:number;
  allowRefusal?:boolean;timeZone?:string
}

export type FormChoiceExtrasQuestion={
  itemKey:string;type:string;otherOptionKey?:string;otherMaxLength?:number;
  exclusiveOptionKeys?:string[];options:{optionKey:string;label:string}[]
}

export type ConditionalFormItem={
  itemKey:string
  displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string}
  rows?:readonly {rowKey:string}[]
  otherOptionKey?:string
}
