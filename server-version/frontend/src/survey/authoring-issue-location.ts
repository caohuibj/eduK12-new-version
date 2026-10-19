import type { FormDraft,ResearchDraft,ScaleDraft,SjtDraft } from './builder.types'
export type AuthoringIssue={path?:string;line?:number;message:string;severity?:'error'|'warning'}
export function authoringIssueTarget(draft:ResearchDraft,issue:AuthoringIssue){
  if(issue.line)return {label:'导入位置 '+issue.line,targetId:'survey-bulk-input',line:issue.line}
  const path=(issue.path??'').replace(/^definition\./,'')
  const fallback={label:'工具设置',targetId:'survey-authoring-definition'}
  const answerKey=path.match(/^answers\.([a-z][a-z0-9_-]*)/i)?.[1]
  if(draft.kind==='FORM'){
    if(answerKey){
      const pages=(draft.definition as FormDraft).pages,pi=pages.findIndex(p=>p.questions.some(q=>q.itemKey===answerKey))
      const qi=pi<0?-1:pages[pi].questions.findIndex(q=>q.itemKey===answerKey)
      if(qi>=0)return {label:`第 ${pi+1} 页 · 第 ${qi+1} 题`,targetId:'survey-form-'+answerKey}
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
