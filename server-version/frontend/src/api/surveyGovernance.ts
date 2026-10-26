import type {CatalogClassificationTag} from './catalogDiscovery'
import {toolLibraryApi} from '../survey/tool-library-api'
import api from './client'
export type ToolFamily='SCALE'|'COGNITIVE'|'SJT'|'FORM'|'COMBINATION'|'BUNDLE'
export type ToolSource={kind:'SCALE'|'COGNITIVE'|'SJT'|'FORM';sourceId:string;sourceVersion:string;organizationId?:string}
export type PackageComponent={slotKey:string;source:{type:'STANDARD'|'GOVERNED';id:string;hash:string}}
export type VersionAxes={content:string;parameters:string|null;report:string|null}
export type ComponentSummary={slotKey:string;title:string;kind:string;source?:PackageComponent['source'];versions?:VersionAxes|null}
export type ComponentOption={source:PackageComponent['source'];title:string;kind:ToolFamily;versions?:VersionAxes;metrics:Array<{metricKey:string;unit:string}>;fields:Array<{itemKey:string;label:string}>}
export type GovernedItem={classificationTags?:CatalogClassificationTag[];id:string;family:ToolFamily;title:string;toolKey:string;toolVersion:string;hash:string;state:string;version:number;blockers:string[];submittedBy:string;approvedBy:string|null;approvedAt:string|null;reason:string;versions:VersionAxes;metrics:Array<{metricKey:string;unit:string}>;components:ComponentSummary[];policyIdentity:{resourceKey:string;fingerprint:string};policy?:{decision:'APPROVED'|'RETURNED'|'PENDING';paused:boolean;version:number;reason:string};states?:{content:{ready:boolean;reasons:string[]};assignment:{ready:boolean;reasons:string[]};deployment:{ready:boolean;reasons:string[]}}}
export type PackageGrant={id:string;title:string;family:ToolFamily;hash:string;status:string;version:number;expiresAt:string|null;versions?:VersionAxes;components?:ComponentSummary[];availability?:{ready:boolean;reasons:string[];requiresFreshCheck:boolean}}
export type PackageReport={version:string;title:string;introduction:string;disclaimer:string;blocks:Array<{type:'METRIC';slotKey:string;metricKey:string;label:string}|{type:'FORM_FIELD';slotKey:string;itemKey:string;label:string}|{type:'TEXT';text:string}>}
export const toolFamilyLabels:Record<ToolFamily,string>={SCALE:'量表',COGNITIVE:'认知测验',SJT:'情境判断测验',FORM:'表单',COMBINATION:'单纯组合',BUNDLE:'组合包'}
export const toolStateLabels:Record<string,string>={SUBMITTED:'待系统审核',RETURNED:'已退回',APPROVED:'已批准 · 待试运行',TRIAL_RUNNING:'自动试运行中',TRIAL_FAILED:'试运行未通过',ONLINE:'已上线',WITHDRAWN:'已停止新增使用'}
export async function governedRequest<T>(scope:'survey-tools'|'survey-tool-use',path:string,body?:unknown):Promise<T>{const r=body===undefined?await api.get<T>('/platform/'+scope+path):await api.post<T>('/platform/'+scope+path,body);if(r.code!==0||r.data==null)throw new Error(r.message||'操作未完成');return r.data}
export async function governedResearcherRequest<T>(path:string,body?:unknown):Promise<T>{return toolLibraryApi<T>('/governed-projects'+path,body===undefined?'GET':'POST',body)}

export function toolSourceBlocker(reason:string|null){const labels:Record<string,string>={SOURCE_RIGHTS_DO_NOT_ALLOW_SURVEY_REDISTRIBUTION:'原来源未允许在 Survey 中展示和分发；保留原权利记录，不能直接转成可授权工具。',SOURCE_NOT_PUBLISHED:'原来源尚未发布，不能作为固定使用版本。',SOURCE_COGNITIVE_ACCESS_POLICY_REQUIRES_SEPARATE_GRANT:'原认知配置受独立授权策略限制，不能从当前管理身份推导使用权。',SOURCE_COGNITIVE_CONTROLLED_IDENTITY_UNSUPPORTED:'当前 Survey 播放器只接通固定的 Go/No-Go 120 试次协议；此任务或版本尚未适配。',SOURCE_SJT_V1_REQUIRES_SEPARATE_RUNTIME_ADAPTER:'此旧版 SJT 来源尚未接通固定版本适配。',SOURCE_SJT_INCOMPLETE_EXPERT_MATRIX:'SJT 的选项与维度评分对应表不完整。',SOURCE_SJT_FLOW_UNSUPPORTED:'此 SJT 来源流程无法映射为当前固定顺序播放器。',SOURCE_SJT_MODEL_UNSUPPORTED:'此 SJT 评分模型或版本尚未适配。'};return reason?(labels[reason]??reason):'未提供阻塞说明'}
