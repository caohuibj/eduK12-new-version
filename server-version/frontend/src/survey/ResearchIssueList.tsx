import type {ResearchDraft} from './builder.types'
import {authoringIssueTarget,type AuthoringIssue,type ImportIssueContext} from './authoring-issue-location'
export function ResearchIssueList({draft,issues,onLocate,importContext}:{draft:ResearchDraft;issues:AuthoringIssue[];importContext?:ImportIssueContext;
  onLocate:(issue:AuthoringIssue)=>void}){
  if(!issues.length)return null
  return <div className="survey-issue-list" aria-label="待修正的题目与字段">
    <p className="font-semibold">有 {issues.length} 项需要检查，可定位的提示可跳转到对应题目或输入位置。</p>
    <ul>{issues.map((issue,index)=>{const target=authoringIssueTarget(draft,issue,importContext);return <li key={index}>
      {target.targetId?<button type="button" onClick={()=>onLocate(issue)}>{target.label}：{issue.message}</button>
        :<p>{target.label}：{issue.message}</p>}
      <details><summary>查看位置细节</summary><code>{issue.path??'服务端位置编号 '+issue.line+'（不保证为物理行）'}</code></details>
    </li>})}</ul>
  </div>
}
