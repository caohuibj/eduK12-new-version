import api from './client'
import type {CatalogClassificationTag} from './catalogDiscovery'
export type Axis='CONTENT'|'PARAMETERS'|'REPORT'
export type Selection={toolKey:string;CONTENT:string;PARAMETERS:string;REPORT:string}
export type VersionPart={axis:Axis;version:string;hash:string;sourceVersion:string;payload:unknown;reference:unknown}
export type StandardState={id:string;state:'APPROVED'|'TRIAL_RUNNING'|'TRIAL_FAILED'|'ONLINE'|'WITHDRAWN';version:number;approvedBy:string;approvedAt:string;latestTrial:string|null;blockers:string[];combinationHash:string;versions:Record<Axis,{version:string;hash:string}>;reference?:unknown}
export type StandardItem={toolKey:string;instrumentVersion:string;title:string;versions:Array<Pick<VersionPart,'axis'|'version'|'hash'>>;combinationHash:string|null;blockers:string[];releases:StandardState[];tags:string[];classificationTags?:CatalogClassificationTag[]}
export type StandardDetail={available:VersionPart[];selection:Selection;history:StandardState[];trials:Array<{releaseId:string;runId:string;caseIndex:number;recordHash:string;createdAt:string;scores?:unknown;report?:unknown}>;reference:unknown}
export type StandardPreview={combinationHash:string;blockers:string[];title:string;parts:Record<Axis,VersionPart>;template:unknown;reference:unknown}
export async function standardRequest<T>(path:string,body?:unknown):Promise<T>{const r=body===undefined?await api.get<T>('/platform/survey-standard'+path):await api.post<T>('/platform/survey-standard'+path,body);if(r.code!==0||r.data==null)throw new Error(r.message||'操作未完成');return r.data}
