import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, Upload, FileText, Image, Video, Wrench, ArrowRight, Pencil, X } from 'lucide-react'
import apiClient from '../api/client'
import MediaSelector from '../components/MediaSelector'
import { ProductButton } from '../components/product-ui'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import FormalReferenceStudio from './FormalReferenceStudio'
import { useAuth } from '../contexts/AuthContext'
import './training-workspace.css'
import './training-workspace-heading.css'
import './training-workspace-cards.css'

type Row = { canUpdateVersion?:boolean; id:string; name:string; kind:string; description?:string; source:'owned'|'granted'; status?:string; version?:string; size?:number; url?:string; updatedAt?:string; href?:string }
const labels:Record<string,string> = {image:'图片',video:'视频',document:'文档',scale:'量表',form:'表单','form-composition':'表单',situational:'情境判断', 'sjt-draft':'情境判断',cognitive:'认知测验',composition:'组合测评',bundle:'组合测评 · 预置授权'}
const statuses:Record<string,string> = {DRAFT:'草稿',PUBLISHED:'已发布',IN_REVIEW:'审核中',REJECTED:'待修订',DEPRECATED:'已停用',RETIRED:'已停用'}
const mediaKinds = [['all','全部'],['video','视频'],['image','图片'],['document','文档']]
const toolKinds = [['all','全部'],['scale','量表'],['form','表单'],['situational','情境判断'],['cognitive','认知测验'],['composition','组合测评']]
const LIBRARY_PAGE_SIZE = 9

export default function TrainingLibrary({ area }:{area:'media'|'tools'}) {
  const media=area==='media', navigate=useNavigate(), {user}=useAuth()
  const [params,setParams]=useSearchParams()
  const keyword=params.get('keyword')||'', kind=params.get('kind')||'all', source=params.get('source')||'all'
  const page=Math.max(1,Number(params.get('page'))||1)
  const [search,setSearch]=useState(keyword),[rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0)
  const [governanceOpen,setGovernanceOpen]=useState(false)
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0)
  const [rename,setRename]=useState<Row|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false)
  const [preview,setPreview]=useState<Row|null>(null),[upload,setUpload]=useState<'video'|'image'|'document'|null>(null)
  const update=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value==='all'||!value)next.delete(key);else next.set(key,value);next.delete('page');setParams(next,{replace:true})}
  useEffect(()=>{setNotice('')},[area,keyword,kind,source,page])
  useEffect(()=>{
    if(!notice)return
    const timer=window.setTimeout(()=>setNotice(''),5000)
    return()=>window.clearTimeout(timer)
  },[notice])
  useEffect(()=>{setSearch(keyword)},[keyword])
  useEffect(()=>{
    let active=true;setLoading(true);setError('')
    void apiClient.get<{list:Row[];total:number}>(`/training-workspace/${media?'media':'tools'}`,{params:{keyword,kind,source,page,pageSize:LIBRARY_PAGE_SIZE}})
      .then(result=>{if(!active)return;if(result.code!==0)throw new Error(result.message);const last=Math.max(1,Math.ceil(result.data.total/LIBRARY_PAGE_SIZE));if(page>last){setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(last));return next},{replace:true});return}setRows(result.data.list);setTotal(result.data.total)})
      .catch(cause=>{if(active)setError(cause.message||'读取失败，请重试')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[media,keyword,kind,source,page,revision,setParams])
  async function saveName(){
    if(!rename||!name.trim())return;setBusy(true);setError('');setNotice('')
    try{const result=await apiClient.patch(`/training-workspace/media/${rename.id}/name`,{name:name.trim()});if(result.code!==0)throw new Error(result.message);setRename(null);setNotice('名称已更新，已有引用保持有效。');setRevision(value=>value+1)}catch(cause){setError(cause instanceof Error?cause.message:'改名失败')}finally{setBusy(false)}
  }
  async function updateVersion(row:Row){
    setBusy(true);setError('')
    try{
      let path='';let result:any
      if(row.kind==='scale'){result=await apiClient.post(`/scales/${row.id}/copy`,{});path='/scales/'}
      else if(row.kind==='form'){result=await apiClient.post(`/general-questionnaires/${row.id}/duplicate`,{});path='/general-questionnaires/'}
      else if(row.kind==='sjt-draft'){result=await apiClient.post(`/situational/authoring/drafts/${row.id}/version`,{});path='/sjt-authoring?draftId='}
      else {result=await apiClient.post(`/questionnaire-products/${row.id}/copy`,{requestId:crypto.randomUUID()});path='/questionnaire-products/'}
      if(result.code!==0||!result.data?.id)throw new Error(result.message||'无法创建新版本草稿')
      navigate(path+result.data.id+(row.kind==='form'?'/edit':''))
    }catch(cause){setError(cause instanceof Error?cause.message:'无法创建新版本')}finally{setBusy(false)}
  }
  const pages=Math.max(1,Math.ceil(total/LIBRARY_PAGE_SIZE))
  return <div className="training-library">
    <header className="training-library-heading training-workspace-heading"><div><h1>{media?'媒体':'工具'}</h1><p>{media?'统一管理上传的素材，查找已获授权的教学资源。':'编制和管理教学工具，按授权使用测验与组合测评。'}</p></div>
      <form className="training-workspace-search" role="search" onSubmit={event=>{event.preventDefault();update('keyword',search.trim())}}><Search size={18} aria-hidden="true"/><input aria-label={media?'检索媒体':'检索工具'} placeholder={media?'搜索媒体名称':'搜索工具名称或介绍'} value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button type="button" aria-label="清除检索" onClick={()=>{setSearch('');update('keyword','')}}><X size={16}/></button>}<button type="submit">检索</button></form>
      <details className="training-library-create"><summary><Plus size={18}/>{media?'上传媒体':'编制工具'}</summary><div>{media?(['video','image','document'] as const).map(type=><button key={type} onClick={()=>{setUpload(type);document.querySelector<HTMLDetailsElement>('.training-library-create')?.removeAttribute('open')}}><Upload size={16}/>上传{labels[type]}</button>):<><Link to="/scales">编制量表</Link><Link to="/general-questionnaires/create">编制表单</Link><Link to="/sjt-authoring">编制情境判断</Link><Link to="/questionnaire-products/new">编制组合测评</Link></>}</div></details>
    </header>
    <div className="training-library-filter training-workspace-filter-bar"><div className="training-workspace-filters" role="group" aria-label="资源类型">{(media?mediaKinds:toolKinds).map(([value,label])=><button key={value} aria-pressed={kind===value} onClick={()=>update('kind',value)}>{label}</button>)}</div><div className="training-library-filter-meta"><label>来源<select aria-label="资源来源" value={source} onChange={event=>update('source',event.target.value)}><option value="all">全部来源</option><option value="owned">{media?'我上传的':'我编制的'}</option><option value="granted">已获授权</option></select></label><span>{loading?'正在读取…':`共 ${total} 项`}</span></div></div>
    {error&&!rename&&<div role="alert" className="training-library-error">{error}<button onClick={()=>setRevision(value=>value+1)}>重新读取</button></div>}{notice&&<div role="status" className="training-library-notice"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {loading?<p role="status" className="training-library-empty">正在读取{media?'媒体':'工具'}…</p>:!error&&!rows.length?<div className="training-library-empty"><Wrench size={28}/><h2>暂无符合条件的{media?'媒体':'工具'}</h2><p>调整检索和筛选条件，或{media?'上传新的素材':'编制你的第一个工具'}。</p></div>:<div className="training-library-grid training-workspace-grid">{rows.map(row=>{
      const Icon=row.kind==='image'?Image:row.kind==='video'?Video:media?FileText:Wrench
      const versionable=row.canUpdateVersion===true&&row.source==='owned'&&row.status==='PUBLISHED'&&['scale','form','composition','form-composition','sjt-draft'].includes(row.kind)
      return <article key={row.kind+':'+row.id} className="training-library-card training-workspace-card" aria-labelledby={`resource-${row.kind}-${row.id}`}>
        <div className="training-workspace-card-top">
          <span className="training-workspace-card-kind"><Icon size={18} aria-hidden="true"/>{labels[row.kind]}</span>
          <span className="training-workspace-card-badge">{row.source==='owned'?(media?'我上传的':'我编制的'):'已获授权'}</span>
        </div>
        <h2 id={`resource-${row.kind}-${row.id}`} className="training-workspace-card-title" title={row.name}>{row.name}</h2>
        {row.status&&<span className={`training-workspace-card-status is-${row.status.toLowerCase()}`}>{statuses[row.status]||row.status}</span>}
        {row.description&&<p className="training-library-description" title={row.description}>{row.description}</p>}
        <footer className="training-workspace-card-footer">
          <div className="training-workspace-card-meta">
            {row.version?<span>{['composition','form-composition'].includes(row.kind)?'修订':'版本'} {row.version}</span>:row.size!=null?<span>{(row.size/1024/1024).toFixed(1)} MB</span>:null}
            {row.updatedAt&&<time dateTime={row.updatedAt}>更新于 {new Date(row.updatedAt).toLocaleDateString('zh-CN')}</time>}
          </div>
          <div className="training-workspace-card-actions">{media?<>
            <button className="training-workspace-card-primary" onClick={()=>setPreview(row)}>预览<ArrowRight size={16} aria-hidden="true"/></button>
            {row.source==='owned'&&<button onClick={()=>{setRename(row);setName(row.name)}}><Pencil size={15} aria-hidden="true"/>改名</button>}
          </>:<>
            {row.kind==='form'&&row.source==='granted'?<button className="training-workspace-card-primary" disabled={busy} onClick={()=>void updateVersion(row)}>复用为我的草稿<ArrowRight size={16} aria-hidden="true"/></button>:<Link className="training-workspace-card-primary" to={row.kind==='form-composition'?'/questionnaire-products/'+row.id:row.href||'/toolkit'}>{row.kind==='composition'?'配置与报告':row.source==='owned'&&row.status==='DRAFT'?'编辑':row.source==='granted'?'查看与使用':'查看'}<ArrowRight size={16} aria-hidden="true"/></Link>}
            {row.source==='owned'&&row.status==='DRAFT'&&row.kind==='composition'&&<Link to={'/questionnaire-products/'+row.id}>编辑内容</Link>}
            {versionable&&<button disabled={busy} onClick={()=>void updateVersion(row)}>更新版本</button>}
          </>}</div>
        </footer>
      </article>
    })}</div>}
    {pages>1&&<nav className="training-library-pagination" aria-label="资源分页"><button disabled={page<=1||loading} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page-1));setParams(next)}}>上一页</button><span>{page} / {pages}</span><button disabled={page>=pages||loading} onClick={()=>{const next=new URLSearchParams(params);next.set('page',String(page+1));setParams(next)}}>下一页</button></nav>}
    {!media&&<><p className="training-library-footnote">更新已发布的工具会创建独立草稿。课程继续使用原版本；获授权的工具按许可使用。</p><details className="training-library-governance" onToggle={event=>setGovernanceOpen(event.currentTarget.open)}><summary>参考、阈值与报告管理</summary><p>课程私有配置请进入上方组合测评的“配置与报告”；下方管理可复用的参考内容。</p>{governanceOpen&&user?.id&&<FormalReferenceStudio key={user.id} actorId={user.id}/>}</details></>}
    {rename&&<ManagementDialog open title="修改媒体名称" onClose={()=>{if(!busy)setRename(null)}} actions={<><ProductButton disabled={busy} onClick={()=>setRename(null)}>取消</ProductButton><ProductButton variant="primary" disabled={busy||!name.trim()} onClick={()=>void saveName()}>{busy?'正在保存…':'保存名称'}</ProductButton></>}><label className="training-library-rename">显示名称<input maxLength={160} autoFocus value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void saveName()}}/></label><p>只更新显示名称，保留原文件及已有引用。</p>{error&&<p role="alert">{error}</p>}</ManagementDialog>}
    {preview&&<ManagementDialog open title={preview.name} onClose={()=>setPreview(null)}>{preview.kind==='image'?<img className="training-library-preview" src={preview.url} alt={preview.name}/>:preview.kind==='video'?<video className="training-library-preview" controls src={preview.url}/>:<iframe className="training-library-document" title={preview.name} src={preview.url}/>}</ManagementDialog>}
    {upload&&<MediaSelector isOpen type={upload} initialTab="upload" onClose={()=>{setUpload(null);setRevision(value=>value+1)}} onSelect={()=>{setUpload(null);setRevision(value=>value+1);setNotice('媒体已上传。')}}/>}
  </div>
}
