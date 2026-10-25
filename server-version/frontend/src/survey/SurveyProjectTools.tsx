import {deferredResearcherComponent} from './deferred-researcher-component'
import {useCallback,useRef,useState} from 'react'
import {Plus,ArrowRight} from 'lucide-react'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import {useInstrumentLibrary,type InstrumentLibrary} from './instrument-library'
import {libraryKindLabel} from './tool-library-api'
import {packageArrangement,moveArrangementUnit,restorePackage,type PackageMembership} from './package-arrangement'
import {ExactToolVersions,exactVersionLabel} from './ExactToolVersions'
const SurveyToolLibrary=deferredResearcherComponent(()=>import('./SurveyToolLibrary').then(m=>m.SurveyToolLibrary),'工具集')
const SurveyBuilder=deferredResearcherComponent(()=>import('./SurveyBuilder').then(m=>m.SurveyBuilder),'兼容管理')
const ResearchPackageCatalog=deferredResearcherComponent(()=>import('./ResearchPackageCatalog').then(m=>m.ResearchPackageCatalog),'授权整包目录')
type SelectedTool={id:string;title:string;kind:string;revision?:number;status:string}
export type SelectionOptions={wholePackage:boolean;membership?:PackageMembership}
export function SurveyProjectTools({projectId,projectStatus,instrumentLibrary,onLeaveRiskChange,onNavigateLibrary,onSelected,onBeforeSelect,selectedTools,onReorder,selectionIds,memberships=[],membershipLoading=false,membershipError='',onRetryMembership}:{
 projectId:string;projectStatus:string;instrumentLibrary:InstrumentLibrary;onLeaveRiskChange:(risk:BuilderLeaveRisk)=>void;onNavigateLibrary:()=>void;
 onSelected?:(ids:string[],options?:SelectionOptions)=>Promise<void>;onBeforeSelect?:()=>boolean;onReorder?:(ids:string[])=>void;selectedTools?:SelectedTool[];selectionIds?:string[];
 memberships?:PackageMembership[];membershipLoading?:boolean;membershipError?:string;onRetryMembership?:()=>void
}){
 const [legacy,setLegacy]=useState(false),[picker,setPicker]=useState(false),[packages,setPackages]=useState(false)
 const [packageBusy,setPackageBusy]=useState(false),[selectionBusy,setSelectionBusy]=useState(false)
 const {list,page,loading,error,refresh}=useInstrumentLibrary(projectId,instrumentLibrary)
 const risks=useRef({picker:{dirty:false,busy:false},legacy:{dirty:false,busy:false},packages:false})
 const pickerRisk=useCallback((risk:BuilderLeaveRisk)=>{risks.current.picker=risk;setSelectionBusy(risk.busy||risks.current.legacy.busy);onLeaveRiskChange({dirty:risk.dirty||risks.current.legacy.dirty,busy:risk.busy||risks.current.legacy.busy||risks.current.packages})},[onLeaveRiskChange])
 const legacyRisk=useCallback((risk:BuilderLeaveRisk)=>{risks.current.legacy=risk;setSelectionBusy(risk.busy||risks.current.picker.busy);onLeaveRiskChange({dirty:risk.dirty||risks.current.picker.dirty,busy:risk.busy||risks.current.picker.busy||risks.current.packages})},[onLeaveRiskChange])
 const packageRisk=useCallback((busy:boolean)=>{risks.current.packages=busy;setPackageBusy(busy);onLeaveRiskChange({dirty:risks.current.picker.dirty||risks.current.legacy.dirty,busy:busy||risks.current.picker.busy||risks.current.legacy.busy})},[onLeaveRiskChange])
 const tools=selectedTools??list,ids=selectionIds??tools.map(t=>t.id),units=packageArrangement(ids,memberships),broken=units.some(u=>u.issues.length),waiting=membershipLoading||Boolean(membershipError)
 const title=(id:string)=>tools.find(t=>t.id===id)?.title??id
 return <section id="survey-wave-content" tabIndex={-1} className="survey-project-tool-selection">
  <header className="survey-library-heading"><div><h2>{onSelected?'问卷内容与顺序':'研究工具'}</h2><p>{onSelected?'普通工具和每次导入的整包按编排单元移动；包内批准顺序固定。':'本研究选用的内容独立保存，工具在首页工具集中编制。'}</p></div><div className="survey-template-actions"><button type="button" className="btn-secondary" onClick={onNavigateLibrary}>工具集 <ArrowRight size={16}/></button><button type="button" className="btn-primary" aria-expanded={picker} disabled={!['DRAFT','ACTIVE'].includes(projectStatus)||waiting} onClick={()=>setPicker(v=>!v)}><Plus size={17}/>{picker?'收起选用':'从工具集添加'}</button></div></header>
  {error&&<p role="alert" className="survey-library-error">{error}<button type="button" disabled={loading} onClick={()=>void refresh(page).catch(()=>{})}>重新读取</button></p>}
  {loading&&<p role="status">正在读取研究工具…</p>}{membershipLoading&&<p role="status">正在核对已选工具的整包身份…</p>}
  {membershipError&&<p role="alert">{membershipError}<button type="button" onClick={onRetryMembership}>重试整包身份读取</button></p>}
  {broken&&<p role="alert">原草稿存在不完整、乱序或插入工具的整包，尚未自动改变。原序列：{ids.map(title).join(' → ')}。请显式恢复或移除该整包。</p>}
  {!loading&&!error&&!ids.length&&<p className="survey-library-empty">尚未加入工具，点击“从工具集添加”开始选用。</p>}
  <ul className="survey-selected-tools">{units.map((unit,index)=>{
   const p=unit.package,tool=tools.find(t=>t.id===unit.ids[0]),label=p?'整包 '+p.title+' #'+p.id.slice(0,8):title(unit.id)
   return <li key={unit.id}>
    {p?<div><strong>{p.title} · 整包实例 #{p.id.slice(0,8)}</strong><ExactToolVersions versions={p.versions} hash={p.hash} kind={p.family}/>
     {p.availability?.reasons.map(reason=><p key={reason}>{reason}；修复顺序不恢复使用授权。</p>)}
     {unit.issues.map(issue=><p role="alert" key={issue}>{issue}</p>)}
     <details><summary>批准组件及固定顺序（{p.bindings.length} 项，只读）</summary><ol>{p.bindings.map((b,i)=><li key={b.draftId}>{i+1}. {p.components?.find(c=>c.slotKey===b.slotKey)?.title??title(b.draftId)}{!ids.includes(b.draftId)&&' · 尚未选中'}{p.components?.filter(c=>c.slotKey===b.slotKey).map(c=><small key={c.slotKey}>{exactVersionLabel(c.versions,c.source?.hash??b.draftId,c.kind)}</small>)}</li>)}</ol></details>
    </div>:<><span className="survey-selected-kind">{onSelected?(index+1)+'. ':''}{libraryKindLabel[tool?.kind as keyof typeof libraryKindLabel]??tool?.kind}</span><strong>{title(unit.id)}</strong><small>修订 {tool?.revision??'—'} · {{DRAFT:'研究内副本',PUBLISHED:'已发布',ARCHIVED:'已归档'}[tool?.status??'']??tool?.status}</small></>}
    {onReorder&&<div className="survey-selected-actions">
     {unit.issues.length>0&&p&&<button type="button" disabled={waiting} onClick={()=>onReorder(restorePackage(ids,p))}>恢复完整整包及批准顺序</button>}
     <button type="button" aria-label={'上移 '+label} disabled={waiting||broken||index===0} onClick={()=>onReorder(moveArrangementUnit(ids,memberships,unit.id,-1))}>↑</button>
     <button type="button" aria-label={'下移 '+label} disabled={waiting||broken||index===units.length-1} onClick={()=>onReorder(moveArrangementUnit(ids,memberships,unit.id,1))}>↓</button>
     <button type="button" disabled={waiting} onClick={()=>{const own=new Set(p?p.bindings.map(b=>b.draftId):unit.ids);onReorder(ids.filter(id=>!own.has(id)))}}>{p?'从本波次移除整包':'移除'}</button>
    </div>}
   </li>
  })}</ul>
  {!selectedTools&&(page>1||list.length===25)&&<div className="survey-library-pagination"><button className="btn-secondary" disabled={loading||page<=1} onClick={()=>void refresh(page-1).catch(()=>{})}>上一页</button><span>第 {page} 页</span><button className="btn-secondary" disabled={loading||list.length<25} onClick={()=>void refresh(page+1).catch(()=>{})}>下一页</button></div>}
  {picker&&<SurveyToolLibrary projectId={projectId} onLeaveRiskChange={pickerRisk} targetLabel={onSelected?'加入当前问卷':undefined} onBeforeSelect={onBeforeSelect} onSelected={async ids=>{await onSelected?.(ids);await instrumentLibrary.changed(1)}} onNavigateLibrary={onNavigateLibrary}/>}
  <button type="button" className="btn-secondary" aria-expanded={packages} disabled={!['DRAFT','ACTIVE'].includes(projectStatus)||packageBusy||waiting} onClick={()=>setPackages(v=>!v)}>{packages?'收起授权整包':'从授权整包添加'}</button>
  {packages&&<ResearchPackageCatalog projectId={projectId} busy={selectionBusy} onBusyChange={packageRisk} onBeforeImport={onBeforeSelect} onImported={async(bindings,membership)=>{await onSelected?.(bindings.map(b=>b.draftId),{wholePackage:true,membership})}} onRefresh={async({retry})=>{if(retry)await instrumentLibrary.load(1,true);else await instrumentLibrary.changed(1)}}/>}
  <details className="survey-library-help"><summary>选用与发布说明</summary><p>工具集后续修改不覆盖本研究。整包整体移动、整体取消本波次选用，不删除工具、授权或历史。完整性恢复不会恢复失效权限；发布与后续采集仍由服务器核对。</p></details>
  <details className="survey-project-tools-legacy" onToggle={e=>{if(e.currentTarget.open)setLegacy(true)}}><summary>已加入工具的查看与兼容管理</summary>{legacy&&<SurveyBuilder legacyOnly projectId={projectId} projectStatus={projectStatus} instrumentLibrary={instrumentLibrary} onLeaveRiskChange={legacyRisk}/>}</details>
 </section>
}
