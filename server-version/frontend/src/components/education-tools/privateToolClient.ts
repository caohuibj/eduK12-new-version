import {useEffect,useState} from 'react'
import type {ScaleDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {FormDraft} from '../../survey/builder.types'
export type PrivateToolApi=<T>(path:string,method?:string,data?:unknown,options?:{responseType?:'blob'})=>Promise<T>
export type PrivateToolKind='SCALE'|'FORM'
export type PrivateToolSummary={id:string;kind:PrivateToolKind;title:string;revision:number;contentHash:string;updatedAt?:string}
export type PrivateTool=PrivateToolSummary & {definition:ScaleDefinition|FormDraft}
export type PrivateToolIssue={path:string;message:string;severity?:string}
export type PrivateToolValidation={valid:boolean;issues:PrivateToolIssue[];revision:number;contentHash:string}
export type PrivateToolVersion={id:string;title:string;sourceRevision:number;contentHash:string;definition?:ScaleDefinition|FormDraft}
export type PrivateDraftState={dirty:boolean;writing:boolean}
export const privateToolBase=(organizationId:string)=>`/organizations/${encodeURIComponent(organizationId)}/private-tools`
export function usePrivateToolCapability(api:PrivateToolApi,organizationId:string,userId?:string){
 const [result,setResult]=useState<{scope:string;canAuthor:boolean}>({scope:'',canAuthor:false})
 const scope=userId&&organizationId?`${userId}:${organizationId}`:''
 useEffect(()=>{let alive=true
  if(scope)void api<{canAuthor:boolean;authorableToolKinds:string[]}>(`/organizations/${encodeURIComponent(organizationId)}/tool-authoring-capabilities`)
   .then(value=>{if(alive)setResult({scope,canAuthor:value.canAuthor&&value.authorableToolKinds.includes('SCALE')&&value.authorableToolKinds.includes('FORM')})})
   .catch(()=>{if(alive)setResult({scope,canAuthor:false})})
  return()=>{alive=false}
 },[api,organizationId,scope])
 return Boolean(scope&&result.scope===scope&&result.canAuthor)
}
export function privateToolError(error:unknown):string{
 const value=(error&&typeof error==='object'?error:typeof error==='string'?{message:error}:{}) as {code?:string;message?:string;status?:number}
 const messages:Record<string,string>={
  PRIVATE_TOOL_REVISION_CONFLICT:'草稿已被其他窗口修改。本页内容仍保留，请先核对最新版本，不会自动覆盖。',
  PRIVATE_TOOL_FREEZE_CONFLICT:'固定版本已变化，请核对最新草稿后再试。',
  PRIVATE_TOOL_AUTHOR_REQUIRED:'当前账号或学校不具备私有工具编制权限。',
  PRIVATE_COMPOSITION_SOURCE_NOT_FOUND:'所选固定工具不属于当前作者、学校或入口，或版本已不可用。请重新选择。',
  PRIVATE_COMPOSITION_VARIANT_UNSUPPORTED:'当前普通问卷仅支持本入口的自评对象，请重新核对工具来源。',
  PRIVATE_COMPOSITION_SOURCE_UNAVAILABLE:'所选固定工具当前不可用于新增任务，请重新核对来源状态。',
  PRIVATE_COMPOSITION_VERSION_MISMATCH:'所选问卷固定版本已不匹配，请重新读取并选用版本。',
  PRIVATE_TOOL_IMAGE_INVALID:'图片格式或大小不符合要求，请选择不超过 2MB 的 PNG、JPEG 或 WebP 静态图片。',
  PRIVATE_TOOL_IMAGE_REQUIRED:'请选择要上传的图片。',
  PRIVATE_TOOL_STATIC_IMAGE_REQUIRED:'仅支持静态图片，请勿上传动画图片。',
  PRIVATE_TOOL_IMAGE_NOT_FOUND:'当前工具下未找到这张图片，请重新读取草稿并核对。',
  PRIVATE_TOOL_MEDIA_SCOPE_OR_IDENTITY_INVALID:'图片不属于当前账号、学校或工具，或文件身份已变化，请在当前工具重新上传有权使用的图片。',
  PRIVATE_TOOL_MEDIA_IDENTITY_CONFLICT:'同一图片出现不同文件身份，请核对并重新选择图片。',
  PRIVATE_TOOL_MEDIA_LIMIT:'单份工具最多引用 30 张不同图片，请减少图片后再保存。',
  PRIVATE_TOOL_VIDEO_NOT_READY:'当前入口暂未开放视频，请移除视频引用后再保存。',
  PRIVATE_TOOL_SCOPED_MEDIA_NOT_READY:'当前入口暂不支持图片或视频附件，不能保存含媒体的定义。',
  PRIVATE_TOOL_DEFINITION_INCOMPLETE:'定义尚不完整，请修正检查结果后再预览或固定版本。',
  PRIVATE_TOOL_DEFINITION_INVALID:'量表或表单定义不符合要求。本页内容仍保留，请根据下方检查结果补全题目、选项或计分设置后再保存。',
  PRIVATE_TOOL_DEFINITION_TOO_LARGE:'当前工具内容过多，超过单份草稿的保存限制。请减少内容或拆分为多份工具后再保存。',
  PRIVATE_TOOL_INPUT_INVALID:'提交的参数不符合要求，请核对工具名称及输入内容后再试。',
  PRIVATE_TOOL_PREVIEW_INPUT_INVALID:'试填答案不符合当前定义，请检查必答题、选项及数值范围后重新试填。',
  PRIVATE_TOOL_FORM_UNSCORED:'表单不计算量表分数，请填写表单答案后进行试填检查。',
  PRIVATE_TOOL_CURSOR_INVALID:'分页位置已失效。工具列表请重新读取列表；固定版本请重新读取草稿后再加载，本页编辑不会自动丢弃。',
  PRIVATE_TOOL_CONCURRENT_CHANGE:'其他操作正在更新此工具，本页内容仍保留。请先重新读取并核对最新草稿，再决定是否继续。',
  PRIVATE_TOOL_NOT_FOUND:'当前学校下未找到这份本人私有工具，请返回我的工具并重新读取列表。',
  PRIVATE_TOOL_VERSION_NOT_FOUND:'当前工具下未找到该固定版本，请重新读取草稿并核对版本列表。',
  PRIVATE_TOOL_HASH_MISMATCH:'工具内容一致性检查未通过，已停止本次操作。请保留当前编辑内容并联系管理员核查，不要反复提交。',
 }
 return messages[value.code??'']??messages[value.message??'']??value.message??'操作未完成，请稍后重试。'
}
