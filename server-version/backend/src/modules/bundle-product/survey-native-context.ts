import type {BundleContextFieldDefinitionV1} from '../assessment-bundle/context'

/** Decode only the frozen declared type. Never infer a string/enum as numeric. */
export function decodeSurveyNativeContext(field:BundleContextFieldDefinitionV1,raw:unknown):unknown{
 if(raw===undefined||raw===null||raw==='')return raw
 if(field.valueType==='number'){
  if(typeof raw==='number'&&Number.isFinite(raw))return raw
  if(typeof raw==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())&&Number.isFinite(Number(raw)))return Number(raw)
  throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 }
 if(field.valueType==='boolean'){
  if(typeof raw==='boolean')return raw
  if(raw==='true')return true
  if(raw==='false')return false
  throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 }
 if(typeof raw!=='string'||field.valueType==='enum'&&!field.enumValues?.includes(raw))throw new Error('SURVEY_NATIVE_CONTEXT_TYPE')
 return raw
}
