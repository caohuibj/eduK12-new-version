import { Images, FolderOpen, Wrench } from 'lucide-react'

export type ResearchArea='studies'|'tools'|'media'
const areas=[
  ['studies','/workspace','我的研究',FolderOpen],
  ['tools','/workspace/tools','工具集',Wrench],
  ['media','/workspace/media','素材库',Images],
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
