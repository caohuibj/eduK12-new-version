import {deferredResearcherComponent} from './deferred-researcher-component'
import {useCallback,useRef,useState} from 'react'
import {Plus,ArrowRight} from 'lucide-react'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import {useInstrumentLibrary,type InstrumentLibrary} from './instrument-library'
import {libraryKindLabel} from './tool-library-api'

// Load researcher authoring/preview code only when its existing control is opened.
const SurveyToolLibrary=deferredResearcherComponent(()=>import('./SurveyToolLibrary').then(module=>module.SurveyToolLibrary),'工具集')
const SurveyBuilder=deferredResearcherComponent(()=>import('./SurveyBuilder').then(module=>module.SurveyBuilder),'兼容管理')
const ResearchPackageCatalog=deferredResearcherComponent(()=>import('./ResearchPackageCatalog').then(module=>module.ResearchPackageCatalog),'授权整包目录')
export function SurveyProjectTools({projectId,projectStatus,instrumentLibrary,onLeaveRiskChange,onNavigateLibrary,onSelected,onBeforeSelect,selectedTools,onReorder}:{projectId:string;projectStatus:string;instrumentLibrary:InstrumentLibrary;onLeaveRiskChange:(risk:BuilderLeaveRisk)=>void;onNavigateLibrary:()=>void;onSelected?:(ids:string[],options?:{wholePackage:boolean})=>Promise<void>;onBeforeSelect?:()=>boolean;onReorder?:(ids:string[])=>void;selectedTools?:{id:string;title:string;kind:string;revision?:number;status:string}[]}){
  const [legacy,setLegacy]=useState(false),[picker,setPicker]=useState(false),[packages,setPackages]=useState(false)
  const [packageBusy,setPackageBusy]=useState(false),[selectionBusy,setSelectionBusy]=useState(false)
  const {list,page,loading,error,refresh}=useInstrumentLibrary(projectId,instrumentLibrary)
  const risks=useRef({picker:{dirty:false,busy:false},legacy:{dirty:false,busy:false},packages:false})
  const pickerRisk=useCallback((risk:BuilderLeaveRisk)=>{risks.current.picker=risk;setSelectionBusy(risk.busy||risks.current.legacy.busy);onLeaveRiskChange({dirty:risk.dirty||risks.current.legacy.dirty,busy:risk.busy||risks.current.legacy.busy||risks.current.packages})},[onLeaveRiskChange])
  const legacyRisk=useCallback((risk:BuilderLeaveRisk)=>{risks.current.legacy=risk;setSelectionBusy(risk.busy||risks.current.picker.busy);onLeaveRiskChange({dirty:risk.dirty||risks.current.picker.dirty,busy:risk.busy||risks.current.picker.busy||risks.current.packages})},[onLeaveRiskChange])
  const packageRisk=useCallback((busy:boolean)=>{risks.current.packages=busy;setPackageBusy(busy);onLeaveRiskChange({dirty:risks.current.picker.dirty||risks.current.legacy.dirty,busy:busy||risks.current.picker.busy||risks.current.legacy.busy})},[onLeaveRiskChange])
  return <section id="survey-wave-content" tabIndex={-1} className="survey-project-tool-selection">
    <header className="survey-library-heading"><div><h2>{onSelected?'问卷内容与顺序':'研究工具'}</h2><p>{onSelected?'从工具集添加到当前问卷，普通组合问卷按已编排的顺序加入。':'本研究选用的内容独立保存，工具在首页工具集中编制。'}</p></div><div className="survey-template-actions"><button type="button" className="btn-secondary" onClick={onNavigateLibrary}>工具集 <ArrowRight size={16}/></button><button type="button" className="btn-primary" aria-expanded={picker} disabled={!['DRAFT','ACTIVE'].includes(projectStatus)} onClick={()=>setPicker(value=>!value)}><Plus size={17}/>{picker?'收起选用':'从工具集添加'}</button></div></header>
    {error&&<p role="alert" className="survey-library-error">{error}<button type="button" disabled={loading} onClick={()=>void refresh(page).catch(()=>{})}>重新读取</button></p>}
    {loading&&<p role="status">正在读取研究工具…</p>}
    {!loading&&!error&&!(selectedTools??list).length&&<p className="survey-library-empty">尚未加入工具，点击“从工具集添加”开始选用。</p>}
    <ul className="survey-selected-tools">{(selectedTools??list).map((tool,index)=><li key={tool.id}><span className="survey-selected-kind">{onSelected?(index+1)+'. ':''}{libraryKindLabel[tool.kind as keyof typeof libraryKindLabel]}</span><strong>{tool.title}</strong><small>修订 {tool.revision??'—'} · {{DRAFT:'研究内副本',PUBLISHED:'已发布',ARCHIVED:'已归档'}[tool.status]||tool.status}</small>{onReorder&&<div className="survey-selected-actions"><button type="button" aria-label={'上移 '+tool.title} disabled={index===0} onClick={()=>{const ids=(selectedTools??list).map(row=>row.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];onReorder(ids)}}>↑</button><button type="button" aria-label={'下移 '+tool.title} disabled={index===(selectedTools??list).length-1} onClick={()=>{const ids=(selectedTools??list).map(row=>row.id);[ids[index+1],ids[index]]=[ids[index],ids[index+1]];onReorder(ids)}}>↓</button><button type="button" onClick={()=>onReorder((selectedTools??list).filter(row=>row.id!==tool.id).map(row=>row.id))}>移除</button></div>}</li>)}</ul>
    {!selectedTools&&(page>1||list.length===25)&&<div className="survey-library-pagination"><button className="btn-secondary" disabled={loading||page<=1} onClick={()=>void refresh(page-1).catch(()=>{})}>上一页</button><span>第 {page} 页</span><button className="btn-secondary" disabled={loading||list.length<25} onClick={()=>void refresh(page+1).catch(()=>{})}>下一页</button></div>}
    {picker&&<SurveyToolLibrary projectId={projectId} onLeaveRiskChange={pickerRisk} targetLabel={onSelected?'加入当前问卷':undefined} onBeforeSelect={onBeforeSelect} onSelected={async ids=>{await onSelected?.(ids);await instrumentLibrary.changed(1)}} onNavigateLibrary={onNavigateLibrary}/>}
    <button type="button" className="btn-secondary" aria-expanded={packages} disabled={!['DRAFT','ACTIVE'].includes(projectStatus)||packageBusy} onClick={()=>setPackages(value=>!value)}>{packages?'收起授权整包':'从授权整包添加'}</button>
    {packages&&<ResearchPackageCatalog projectId={projectId} busy={selectionBusy} onBusyChange={packageRisk} onBeforeImport={onBeforeSelect} onImported={async bindings=>{await onSelected?.(bindings.map(b=>b.draftId),{wholePackage:true});await instrumentLibrary.changed(1)}}/>}
    <details className="survey-library-help"><summary>选用与发布说明</summary><p>工具集后续修改不覆盖本研究。只有完成编制的自建工具与有效授权版本可以选用。加入研究的内容成为独立副本，后续工具集修改不覆盖它。普通组合问卷选用后成为独立工具，请在“发布与采集”配置顺序、知情同意与反馈。SJT 和认知测验只支持选用已授权版本。</p></details>
    <details className="survey-project-tools-legacy" onToggle={event=>{if(event.currentTarget.open)setLegacy(true)}}><summary>已加入工具的查看与兼容管理</summary>
      {legacy&&<SurveyBuilder legacyOnly projectId={projectId} projectStatus={projectStatus} instrumentLibrary={instrumentLibrary} onLeaveRiskChange={legacyRisk}/>}
    </details></section>
}
