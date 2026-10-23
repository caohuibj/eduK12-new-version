import React,{useCallback,useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {EducationPrivateFormEditor} from '@source/components/education-tools/EducationPrivateFormEditor'
import {EducationMaterialPicker,EducationMaterialPreview} from '@source/components/education-tools/EducationMaterialPicker'
import {ProductThemeControl} from '@source/components/product-theme/ProductThemeControl'
import {useProductTheme} from '@source/components/product-theme/useProductTheme'
import type {PrivateToolApi} from '@source/components/education-tools/privateToolClient'
import type {AssessmentMaterial} from '@source/modules/assessment-media/material'
import type {FormDraft} from '@source/survey/builder.types'
import '@source/components/education-tools/education-private-tools.css'

const query=new URLSearchParams(location.search)
const entry=query.get('entry')==='school'?'school':'teacher'
const initialState=['empty','selected','error','disabled','display-error'].includes(query.get('state')||'')?query.get('state')!:'selected'
const actorId='synthetic-theme-diagnostic'
const synthetic:AssessmentMaterial={asset:{assetId:'synthetic-image',contentHash:'a'.repeat(64),mimeType:'image/png'},name:'Synthetic'.repeat(33)+'123',caption:'纯合成展示数据，不来自真实用户',rightsStatus:'self_authored',rightsNote:'仅专项诊断使用的合成素材'}
// Same typed two-section definition as school-teacher-fixture.cjs, with only synthetic material metadata added.
function draft(selected:boolean):FormDraft{
 const options=[{optionKey:'a',label:'合成选项甲'},{optionKey:'b',label:'合成选项乙'}]
 const question=(itemKey:string,type:FormDraft['pages'][number]['questions'][number]['type'],prompt:string,extra:Partial<FormDraft['pages'][number]['questions'][number]>={})=>({itemKey,type,prompt,required:true,allowRefusal:false,options:[],rows:[],materials:selected?[synthetic]:[],...extra})
 return {schemaVersion:2,pages:[{pageKey:'typed',title:'合成第一分节',questions:[
  question('choice','SINGLE','合成单选条件题',{options}),
  question('conditional','SHORT_TEXT','合成条件拒答题',{allowRefusal:true,displayIf:{itemKey:'choice',operator:'EQUALS',optionKey:'a'}}),
  question('multiple','MULTIPLE','合成多选题',{options}),
  question('matrix','MATRIX','合成矩阵题',{allowRefusal:true,options,rows:[{rowKey:'r1',label:'合成矩阵第一行'},{rowKey:'r2',label:'合成矩阵第二行'}]}),
 ]},{pageKey:'final',title:'合成第二分节',questions:[question('note','SHORT_TEXT','合成分节确认题')]}]}
}
function Fixture(){
 const appearance=useProductTheme(entry,actorId)
 const [state,setState]=useState(initialState),[value,setValue]=useState(()=>draft(initialState==='selected'||initialState==='disabled'||initialState==='display-error'))
 const [pending,setPending]=useState<Record<string,boolean>>({})
 const bulkPending=Object.values(pending).some(Boolean)
 const onPendingChange=useCallback((id:string,active:boolean)=>setPending(old=>({...old,[id]:active})),[])
 const api=useMemo<PrivateToolApi>(()=>async<T,>(path:string,method='GET'):Promise<T>=>{
  const base='/organizations/synthetic-organization/private-tools/synthetic-tool/'
  if(!path.startsWith(base))throw Error('诊断拒绝非合成工具路径')
  if(method==='GET'&&path.includes('/materials?')){
   if(state==='error')throw Error('合成素材库错误：诊断专用')
   return {list:state==='empty'?[]:[{id:synthetic.asset.assetId,name:synthetic.name,mimeType:synthetic.asset.mimeType,contentHash:synthetic.asset.contentHash,size:69}],total:state==='empty'?0:1,pageSize:9} as T
  }
  if(method==='POST'&&path.endsWith('/materials/register'))return {} as T
  if(method==='GET'&&path.endsWith('/assets/synthetic-image/content')){
   if(state==='display-error')throw Error('合成素材内容读取失败：可重试诊断')
   const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNI60gDAAKsAVWz1uTIAAAAAElFTkSuQmCC'),char=>char.charCodeAt(0))
   return new Blob([bytes],{type:'image/png'}) as T
  }
  throw Error('诊断不执行上传或未知API；没有网络请求')
 },[state])
 return <main className={entry==='school'?'hs-app hs-workspace':'ht-app'} data-theme={appearance.theme} data-testid="theme-root" data-fixture="synthetic-only" data-theme-diagnostic-ready="true">
  <div className={entry==='school'?'hs-workspace-content':'ht-workspace'}>
   <header><h1>合成教育主题专项诊断</h1><p>无账号、无数据库、无业务网络；此页不代表正式业务验收。</p>
    <label>诊断入口<select aria-label="诊断入口" value={entry} onChange={event=>{const next=new URL(location.href);next.searchParams.set('entry',event.target.value);next.searchParams.set('state',state);location.assign(next)}}><option value="school">School</option><option value="teacher">Teacher</option></select></label>
    <label>诊断状态<select aria-label="诊断状态" value={state} onChange={event=>{const next=event.target.value;setState(next);setValue(draft(next==='selected'||next==='disabled'||next==='display-error'));setPending({})}}><option value="empty">空素材</option><option value="selected">已选素材</option><option value="error">素材库错误</option><option value="disabled">禁用编辑</option><option value="display-error">素材内容错误</option></select></label>
    <ProductThemeControl appearance={appearance} product={entry==='school'?'School':'Teacher'}/>
   </header>
   <section className={`education-private-tools education-private-tools--${entry} ${entry==='school'?'hs-panel':'ht-panel'}`} aria-label="我的私有工具">
    <header className="education-private-heading"><h2>合成表单编制</h2><span className="education-private-badge">作者私有</span></header>
    <fieldset disabled={state==='disabled'}><EducationPrivateFormEditor key={state} value={value} onChange={setValue} bulkPending={bulkPending} onPendingChange={onPendingChange}
     renderMaterials={(question,change)=><EducationMaterialPicker api={api} entry={entry==='school'?'SCHOOL':'TEACHER'} actorId={actorId} organizationId="synthetic-organization" toolId="synthetic-tool" value={question.materials} onChange={materials=>change({...question,materials})} label="题目展示素材" disabled={state==='disabled'}/>} />
    </fieldset>
    {(state==='selected'||state==='disabled'||state==='display-error')&&<section aria-label="独立素材预览"><EducationMaterialPreview api={api} organizationId="synthetic-organization" toolId="synthetic-tool" item={synthetic}/></section>}
   </section>
  </div>
 </main>
}
async function start(){
 if(entry==='school')await import('./school-css');else await import('./teacher-css')
 createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>)
}
void start()
