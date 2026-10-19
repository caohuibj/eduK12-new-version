import type {ResearchDraft} from './builder.types'
import {authoringIssueTarget,type AuthoringIssue} from './authoring-issue-location'
export function ResearchIssueList({draft,issues,onLocate}:{draft:ResearchDraft;issues:AuthoringIssue[];
  onLocate:(issue:AuthoringIssue)=>void}){
  if(!issues.length)return null
  return <div className="survey-issue-list" aria-label="待修正的题目与字段">
    <p className="font-semibold">有 {issues.length} 项需要检查，选择提示可定位编辑。</p>
    <ul>{issues.map((issue,index)=><li key={index}>
      <button type="button" onClick={()=>onLocate(issue)}>{authoringIssueTarget(draft,issue).label}：{issue.message}</button>
      <details><summary>查看位置细节</summary><code>{issue.path??'解析器返回位置 '+issue.line}</code></details>
    </li>)}</ul>
  </div>
}
