import type { KeyboardEvent } from 'react'
export type WorkspaceSection='settings'|'tools'|'reports'|'publish'|'data'
const sections:[WorkspaceSection,string,string][]=[
  ['settings','研究设置','名称、说明与采集方式'],['tools','研究工具','编题、导入与试答'],
  ['reports','私有报告','模板、合成预览与版本'],
  ['publish','发布与采集','波次、知情同意与链接'],['data','研究数据','质量、分析与导出'],
]
export function SurveyWorkspaceNav({active,onChange,title,onReturn}:{active:WorkspaceSection;
  onChange:(section:WorkspaceSection)=>void;title:string;onReturn?:()=>void}){
  const navigate=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const next=event.key==='Home'?0:event.key==='End'?sections.length-1:
      event.key==='ArrowRight'?(index+1)%sections.length:
      event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:null
    if(next===null)return
    event.preventDefault();onChange(sections[next][0])
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  return <header className="survey-workspace-nav">
    {onReturn&&<button type="button" className="survey-context-back" onClick={onReturn}>← 返回研究列表（保留编辑）</button>}
    <p className="survey-workspace-eyebrow">RESEARCH · 研究编辑</p><h1 id="survey-current-project-heading" tabIndex={-1}>{title}</h1>
    <p>按研究设置、工具编制、报告编制、发布采集和数据整理逐步完成。切换分区会保留本页未保存的编辑；离开页面前请保存。</p>
    <div role="tablist" aria-label="研究工作分区">
      {sections.map(([key,label,hint],index)=><button key={key} type="button" role="tab"
        id={'survey-workspace-tab-'+key} aria-controls={'survey-workspace-'+key}
        aria-selected={active===key} aria-label={label} tabIndex={active===key?0:-1}
        onKeyDown={event=>navigate(event,index)} onClick={()=>onChange(key)}>
        <span className="survey-workflow-number" aria-hidden="true">0{index+1}</span><strong>{label}</strong><span>{hint}</span>
      </button>)}
    </div>
  </header>
}
