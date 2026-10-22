import { Database, FolderOpen, Wrench } from 'lucide-react'

export type ResearchArea='studies'|'tools'|'datasets'
const areas=[
  ['studies','/workspace','我的研究',FolderOpen],
  ['tools','/workspace/tools','工具集',Wrench],
  ['datasets','/workspace/datasets','数据集',Database],
] as const

export function SurveyResearchNavigation({active,onNavigate}:{active:ResearchArea;onNavigate:(area:ResearchArea,path:string)=>void}){
  return <nav className="survey-research-navigation" aria-label="研究工作台导航">
    {areas.map(([key,path,label,Icon])=><a key={key} href={path} aria-current={active===key?'page':undefined}
      onClick={event=>{
        if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
        event.preventDefault();onNavigate(key,path)
      }}><Icon size={20} strokeWidth={1.6} aria-hidden="true"/>{label}</a>)}
  </nav>
}

export function SurveyResearchPlaceholder({area}:{area:Exclude<ResearchArea,'studies'>}){
  const Icon=area==='tools'?Wrench:Database
  return <section className="survey-research-placeholder" aria-labelledby={'survey-'+area+'-heading'}>
    <span className="survey-placeholder-icon"><Icon size={32} strokeWidth={1.3} aria-hidden="true"/></span>
    <h1 id={'survey-'+area+'-heading'} tabIndex={-1}>{area==='tools'?'工具集':'数据集'}</h1>
    <p>内容即将加入</p>
  </section>
}
