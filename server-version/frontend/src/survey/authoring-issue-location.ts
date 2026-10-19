import type { FormDraft,ResearchDraft,ScaleDraft,SjtDraft } from './builder.types'
export type AuthoringIssue={path?:string;line?:number;message:string;severity?:'error'|'warning'}
export type ImportIssueContext={format:'TEXT'|'CSV';content:string;items:{sourceLine?:number;dimensionKey?:string}[]}
// These messages originate in the existing CSV parser / row checks. Unknown
// messages fail closed: the backend's general apply errors also use line:1.
const physicalCsvMessages=new Set(['未知题型','题干不能为空','required/reverse 应填 true 或 false',
  '数值配置必须为合法有限数字','integer_only 必须为 true 或 false','time_zone 仅支持 UTC 或 Asia/Shanghai',
  '题干超出最大长度','选项或矩阵行超过最大长度','量表仅支持单选/Likert 题块',
  '量表使用共享选项组，CSV 不应重复声明选项','首版描述性量表要求完整作答',
  '请先在 Builder 中将 Form 显式升级至 V2，再导入专业题型','选择题至少需要两项选项',
  '矩阵题必须包含行','此题型不可声明选项','Slider 必须提供 min/max','Constant Sum 必须提供 total'])
function importIssueTarget(draft:ResearchDraft,issue:AuthoringIssue,context?:ImportIssueContext){
  const unresolved={label:'导入内容（无法确定精确行，请检查导入内容及工具设置）',targetId:undefined}
  if(context?.format!=='CSV'||!Number.isInteger(issue.line)||issue.line!<1)return unresolved
  const maxLine=context.content.split('\n').length
  const validLine=(line:number|undefined):line is number=>Number.isInteger(line)&&line!>=1&&line!<=maxLine
  const item=context.items[issue.line!-1]
  if(draft.kind==='SCALE'&&item?.dimensionKey&&issue.message==='指定的量表维度不存在：'+item.dimensionKey
    &&!(draft.definition as ScaleDraft).dimensions.some(d=>d.dimensionKey===item.dimensionKey)){
    if(!validLine(item.sourceLine))return unresolved
    const next=context.items[issue.line!]?.sourceLine
    return {label:`导入第 ${issue.line} 条 · 源文件第 ${item.sourceLine} 行`,targetId:'survey-bulk-input',
      line:item.sourceLine,endLine:validLine(next)&&next>item.sourceLine?next-1:maxLine}
  }
  const header=issue.line===1&&(issue.message.startsWith('缺少必需表头：')||issue.message==='表头不能重复')
  if(validLine(issue.line)&&(header||(issue.line>1&&physicalCsvMessages.has(issue.message))))
    return {label:'导入源文件第 '+issue.line+' 行',targetId:'survey-bulk-input',line:issue.line,endLine:issue.line}
  return unresolved
}
export function authoringIssueTarget(draft:ResearchDraft,issue:AuthoringIssue,context?:ImportIssueContext){
  if(issue.line!==undefined)return importIssueTarget(draft,issue,context)
  const path=(issue.path??'').replace(/^definition\./,'')
  const fallback={label:'工具设置',targetId:'survey-authoring-definition'}
  const answerKey=path.match(/^answers\.([a-z][a-z0-9_-]*)/i)?.[1]
  if(draft.kind==='FORM'){
    if(answerKey){
      const pages=(draft.definition as FormDraft).pages,pi=pages.findIndex(p=>p.questions.some(q=>q.itemKey===answerKey))
      const qi=pi<0?-1:pages[pi].questions.findIndex(q=>q.itemKey===answerKey)
      if(qi>=0)return {label:`第 ${pi+1} 页 · 第 ${qi+1} 题`,targetId:'survey-preview-'+answerKey}
    }
    const m=path.match(/^pages\.(\d+)\.questions\.(\d+)/)
    const q=m&&(draft.definition as FormDraft).pages[+m[1]]?.questions[+m[2]]
    if(q&&m)return {label:`第 ${+m[1]+1} 页 · 第 ${+m[2]+1} 题`,targetId:'survey-form-'+q.itemKey}
  }
  if(draft.kind==='SCALE'){
    if(answerKey){const index=(draft.definition as ScaleDraft).items.findIndex(q=>q.itemKey===answerKey)
      if(index>=0)return {label:'量表第 '+(index+1)+' 题',targetId:'survey-scale-'+answerKey}}
    const m=path.match(/^items\.(\d+)/),q=m&&(draft.definition as ScaleDraft).items[+m[1]]
    if(q&&m)return {label:'量表第 '+(+m[1]+1)+' 题',targetId:'survey-scale-'+q.itemKey}
  }
  if(draft.kind==='SJT'){
    const d=draft.definition as SjtDraft
    if(d.schemaVersion===2){
      const m=path.match(/^scenes\.(\d+)(?:\.questions\.(\d+))?/),scene=m&&d.scenes[+m[1]]
      if(m&&scene){const q=m[2]===undefined?undefined:scene.questions[+m[2]]
        return {label:`情境 ${+m[1]+1}`+(q?` · 第 ${+m[2]+1} 题`:''),
          targetId:q?'survey-sjt-'+q.questionKey:'survey-authoring-definition',sceneIndex:+m[1]}}
    }else{
      const m=path.match(/^questions\.(\d+)/),q=m&&d.questions[+m[1]]
      if(q&&m)return {label:'情境第 '+(+m[1]+1)+' 题',targetId:'survey-sjt-'+q.questionKey}
    }
  }
  return fallback
}
