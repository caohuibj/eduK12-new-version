/** Portable authoring contract; product adapters restrict sources and operators. */
export type FlowField=
  |{source:'ANSWER';instrumentKey:string;itemKey:string}
  |{source:'EMBEDDED';key:string}
export type FlowCondition=
  |{op:'AND'|'OR';terms:FlowCondition[]}
  |{op:'NOT';term:FlowCondition}
  |{op:'EQUALS'|'INCLUDES'|'GT'|'GTE'|'LT'|'LTE'|'IS_MISSING';
    field:FlowField;value?:string|number|boolean}

export type FieldChoice={id:string;label:string;field:FlowField;
  kind:'choice'|'choices'|'number'|'text'|'boolean';options:{key:string;label:string}[]}
export const defaultValue=(field:FieldChoice)=>field.kind==='number'?0:field.kind==='boolean'?true:
  field.options[0]?.key??''
export const defaultPredicate=(fields:FieldChoice[]):FlowCondition=>({
  op:fields[0]?.kind==='choices'?'INCLUDES':'EQUALS',field:fields[0]?.field??{source:'EMBEDDED',key:'placeholder'},
  value:fields[0]?defaultValue(fields[0]):'',
})
