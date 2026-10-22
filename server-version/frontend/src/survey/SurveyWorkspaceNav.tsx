import { surveySectionMeta } from './survey-section-meta'
import type { KeyboardEvent } from 'react'
export type WorkspaceSection='settings'|'reports'|'publish'|'data'
const sections:[WorkspaceSection,string,string][]=[
  ['settings','研究设置','名称、说明与采集方式'],
  ['reports','私有报告','模板、合成预览与版本'],
  ['publish','发布与采集','问卷内容、波次与采集链接'],['data','研究数据','质量、分析与导出'],
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
    <div className="survey-project-context"><div><h1 id="survey-current-project-heading" tabIndex={-1} title={title}>{title}</h1><span className="survey-editor-note" aria-hidden="true">切换分区保留编辑</span></div>
      {onReturn&&<button type="button" className="survey-context-back" aria-label="← 返回研究列表（保留编辑）" title="返回研究列表，保留当前编辑" onClick={onReturn}>← 返回列表</button>}</div>
    <p id="survey-editing-note" className="sr-only">切换分区会保留本页未保存的编辑；离开页面前请保存。</p>
    <div role="tablist" aria-label="研究工作分区" aria-describedby="survey-editing-note">
      {sections.map(([key,label,hint],index)=>{const Icon=surveySectionMeta[key].icon;return <button key={key} type="button" role="tab"
        id={'survey-workspace-tab-'+key} aria-controls={'survey-workspace-'+key}
        aria-selected={active===key} aria-label={label} title={hint} tabIndex={active===key?0:-1}
        onKeyDown={event=>navigate(event,index)} onClick={()=>onChange(key)}>
        <span className="survey-tab-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.6}/></span><strong>{label}</strong>
      </button>})}
    </div>
  </header>
}
