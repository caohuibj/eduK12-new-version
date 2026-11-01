import {sessionFetch} from './client'
import {standardRequest} from './surveyStandard'
import type {ScaleDefinition} from '../pages/scaleDefinitionEditorModel'
import type {ReportTemplateDefinition} from '../modules/assessment-core/report/ReportTemplateFields'

export type ComponentAxis='CONTENT'|'PARAMETERS'|'REPORT'
export type ComponentPointer={releaseId:string;combinationHash:string}
export type ReportPayload=ScaleDefinition['report']|{definition:ScaleDefinition['report'];template:ReportTemplateDefinition;assetRefs?:Array<{assetId:string;sha256:string;mediaType:string}>}
export type ComponentDocument={toolKey:string;configurationName:string;baseCombination:ComponentPointer|null;changedParts:{
 CONTENT?:{version:string;definition:ScaleDefinition;metadata:Record<string,unknown>};PARAMETERS?:{version:string;payload:unknown|null};REPORT?:{version:string;payload:ReportPayload|null}}}
export type ComponentDraft=ComponentDocument&{id:string;revision:number;publishedReleaseId:string|null;updatedAt:string}
export type ImportResult={digest:string;entries:Array<{index:number;toolKey:string|null;configurationName?:string;changedParts?:ComponentAxis[];status?:string;draft?:ComponentDraft;issues:Array<{sheet:string;row:number;path:string;message:string}>}>}
export type ComponentPreview={draftId:string;revision:number;previewHash:string;configurationName:string;baseCombination:ComponentPointer|null;changedParts:ComponentAxis[];inheritedParts:ComponentAxis[];blockers:string[];reviewNotice:string;
 triplet:{combinationHash:string;definition:ScaleDefinition;template:ReportTemplateDefinition|null}|null;parts:Partial<Record<ComponentAxis,{version:string;hash:string;payload:unknown}>>}
export const componentRequest=standardRequest
export async function uploadComponentWorkbook(path:'preview'|'save',file:File,fields:Record<string,string>={}){
 const data=new FormData();data.append('file',file);for(const [key,value] of Object.entries(fields))data.append(key,value)
 const response=await sessionFetch('/api/platform/survey-standard/component-import/'+path,{method:'POST',body:data})
 const envelope=await response.json() as {code:number;data:ImportResult;message?:string}
 if(!response.ok||envelope.code!==0)throw new Error(envelope.message||'Excel 导入未完成')
 return envelope.data
}
export async function downloadComponentTemplate(){
 const response=await sessionFetch('/api/platform/survey-standard/component-template')
 if(!response.ok)throw new Error('模板下载失败，请核对管理员会话')
 const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='scale-components-v1.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export const componentDocument=(draft:ComponentDocument):ComponentDocument=>({toolKey:draft.toolKey,configurationName:draft.configurationName,baseCombination:draft.baseCombination,changedParts:draft.changedParts})
export const componentContentPlaceholder=(definition:ScaleDefinition):ScaleDefinition=>({...definition,referencePolicy:{type:'none'},report:{reportVersion:'none-v1',primaryScoreKeys:definition.scoring.scores.map(s=>s.key),scoreOrder:definition.scoring.scores.map(s=>s.key),interpretations:definition.scoring.scores.map(s=>({scoreKey:s.key,headline:s.label,source:{type:'score_only'},summary:'本配置不提供文字报告。',bands:[],guidance:[]})),limitations:[],disclaimer:'本配置不提供文字报告。'}})
