import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {Search,Upload,Image as ImageIcon,Video,FileText,ArrowRight,Pencil,X,LoaderCircle,FolderOpen} from 'lucide-react'
import ModalSurface from '../components/shared-ui/ModalSurface'
import {ScaleLibraryMediaPreview} from '../components/scale-governance/ScaleLibraryMediaPreview'
import type {GovernanceMediaItem} from '../api/scaleLibraryGovernance'
import {toolLibraryApi as api} from './tool-library-api'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import './survey-material-library.css'

type Kind='image'|'video'|'document'
type Source='all'|'owned'|'granted'
export type SurveyMaterial={id:string;name:string;kind:Kind;mimeType:string;size:number;updatedAt:string;source:Exclude<Source,'all'>;bound?:{entryId:string;title:string;item:GovernanceMediaItem}}
const formats={image:{label:'图片',types:['image/png','image/jpeg','image/webp'],limit:2,hint:'PNG、JPG、WebP · 单张不超过 2 MB',Icon:ImageIcon},video:{label:'视频',types:['video/mp4','video/webm'],limit:50,hint:'MP4、WebM · 单个不超过 50 MB',Icon:Video},document:{label:'文档',types:['application/pdf'],limit:20,hint:'PDF · 单份不超过 20 MB',Icon:FileText}}
const readLocation=()=>{const p=new URLSearchParams(window.location.search);return {source:(['owned','granted'].includes(p.get('source')||'')?p.get('source'):'all') as Source,kind:(['image','video','document'].includes(p.get('kind')||'')?p.get('kind'):'all') as Kind|'all',keyword:p.get('keyword')||'',page:Math.min(1000,Math.max(1,Number(p.get('page'))||1))}}
const sizeLabel=(bytes:number)=>bytes<1024*1024?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1024/1024).toFixed(1)+' MB'
const content=(id:string)=>'/api/survey/media-library/'+encodeURIComponent(id)+'/content'
export function SurveyMaterialLibrary({visible=true,onLeaveRiskChange}:{visible?:boolean;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void}){
  const [filter,setFilter]=useState(readLocation),[search,setSearch]=useState(filter.keyword)
  const [list,setList]=useState<SurveyMaterial[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0)
  const [upload,setUpload]=useState<Kind|null>(null),[file,setFile]=useState<File|null>(null),[uploadError,setUploadError]=useState(''),[busy,setBusy]=useState(false)
  const [preview,setPreview]=useState<SurveyMaterial|null>(null),[previewError,setPreviewError]=useState('')
  const [rename,setRename]=useState<SurveyMaterial|null>(null),[name,setName]=useState(''),[renameError,setRenameError]=useState('')
  const input=useRef<HTMLInputElement>(null),writeLock=useRef(false),uploadMenu=useRef<HTMLDetailsElement>(null),fileId=useId()
  useEffect(()=>{if(!visible)return;const url=new URL(window.location.href);url.pathname='/workspace/media';url.search='';for(const [key,value] of Object.entries(filter))if(value!=='all'&&value!==''&&!(key==='page'&&value===1))url.searchParams.set(key,String(value));window.history.replaceState(null,'',url.pathname+url.search)},[filter,visible])
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return()=>window.clearTimeout(timer)},[notice])
  useEffect(()=>{onLeaveRiskChange?.({dirty:!!file||!!rename&&name.trim()!==rename.name,busy});return()=>onLeaveRiskChange?.({dirty:false,busy:false})},[file,rename,name,busy,onLeaveRiskChange])
  useEffect(()=>{
    if(!visible)return
    let active=true;setLoading(true);setError('')
    const params=new URLSearchParams(Object.entries(filter).map(([key,value])=>[key,String(value)]))
    void api<{list:SurveyMaterial[];total:number}>('/media-library?'+params).then(result=>{
      if(!active)return
      const last=Math.max(1,Math.ceil(result.total/9));if(filter.page>last){setFilter(value=>({...value,page:last}));return}
      setList(result.list);setTotal(result.total)
    }).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:'素材读取失败');setList([])}}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[filter,revision,visible])
  const change=(patch:Partial<typeof filter>)=>{if(busy||rename)return;setFilter(value=>({...value,...patch,page:1}));setNotice('')}
  const closeUpload=useCallback(()=>{if(writeLock.current)return;if(file&&!window.confirm('关闭后将清除已选择的待上传文件，确定关闭？'))return;setUpload(null);setFile(null);setUploadError('')},[file])
  const chooseFile=(candidate?:File)=>{
    setUploadError('');if(!candidate||!upload)return
    const policy=formats[upload]
    if(!policy.types.includes(candidate.type)||!candidate.size||candidate.size>policy.limit*1024*1024){setUploadError('请选择符合要求的文件：'+policy.hint);setFile(null);return}
    setFile(candidate)
  }
  const send=async()=>{
    if(!file||!upload||writeLock.current)return
    writeLock.current=true;setBusy(true);setUploadError('');setNotice('')
    try{
      const csrf=await api<{csrfToken:string}>('/auth/csrf')
      if(!csrf.csrfToken)throw new Error('研究者安全会话不可用，请重新登录')
      const form=new FormData();form.append('file',file)
      const response=await fetch('/api/survey/media-library/upload/'+upload,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf.csrfToken},body:form})
      const result=await response.json()
      if(!response.ok||result.code!==0)throw new Error(result.message||'上传失败，请重试')
      setUpload(null);setFile(null);setFilter({source:'owned',kind:upload,keyword:'',page:1});setSearch('');setRevision(value=>value+1);setNotice('素材已上传，可在卡片中预览或修改名称。')
    }catch(cause){setUploadError(cause instanceof Error?cause.message:'上传结果未确认，请关闭窗口并重新读取列表核对后再试')}
    finally{writeLock.current=false;setBusy(false)}
  }
  const saveName=async()=>{
    if(!rename||!name.trim()||writeLock.current)return
    writeLock.current=true;setBusy(true);setRenameError('')
    try{await api('/media-library/'+encodeURIComponent(rename.id)+'/name','PATCH',{name:name.trim()});setRename(null);setNotice('素材名称已更新，已有引用保持有效。');setRevision(value=>value+1)}
    catch(cause){setRenameError(cause instanceof Error?cause.message:'名称保存失败')}
    finally{writeLock.current=false;setBusy(false)}
  }
  const openUpload=(kind:Kind)=>{setUpload(kind);setFile(null);setUploadError('');if(uploadMenu.current)uploadMenu.current.open=false}
  const pages=Math.max(1,Math.ceil(total/9)),locked=busy||!!rename
  return <section className="survey-material-library" aria-label="研究素材库">
    <header className="survey-material-heading"><div><h1 id="survey-media-heading" tabIndex={-1}>素材库</h1><p>管理视频、图片和文档，查找已获授权的研究素材。</p></div>
      <form className="survey-material-search" role="search" onSubmit={event=>{event.preventDefault();change({keyword:search.trim()})}}><Search size={17} aria-hidden="true"/><input aria-label="检索素材" placeholder="搜索素材名称" maxLength={200} value={search} disabled={locked} onChange={event=>setSearch(event.target.value)}/>{search&&<button type="button" aria-label="清除素材检索" disabled={locked} onClick={()=>{setSearch('');change({keyword:''})}}><X size={15}/></button>}<button disabled={locked} type="submit">检索</button></form>
      <details className="survey-material-create" ref={uploadMenu}><summary aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}><Upload size={17} aria-hidden="true"/>上传素材</summary><div>{(Object.keys(formats) as Kind[]).map(kind=>{const Icon=formats[kind].Icon;return <button key={kind} type="button" disabled={locked} onClick={()=>openUpload(kind)}><Icon size={17} aria-hidden="true"/>上传{formats[kind].label}</button>})}</div></details>
    </header>
    <div className="survey-material-filters"><div role="group" aria-label="素材类型">{(['all','video','image','document'] as const).map(kind=><button type="button" key={kind} disabled={locked} aria-pressed={filter.kind===kind} onClick={()=>change({kind})}>{kind==='all'?'全部':formats[kind].label}</button>)}</div><div><label>来源<select aria-label="素材来源" value={filter.source} disabled={locked} onChange={event=>change({source:event.target.value as Source})}><option value="all">全部来源</option><option value="owned">自主上传</option><option value="granted">授权使用</option></select></label><span>{loading?'正在读取…':`共 ${total} 项`}</span></div></div>
    {error&&<div role="alert" className="survey-material-message is-error">{error}<button type="button" disabled={loading||locked} onClick={()=>setRevision(value=>value+1)}>重新读取列表</button></div>}
    {notice&&<div role="status" className="survey-material-message"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {loading?<div role="status" className="survey-material-empty"><LoaderCircle size={26} className="survey-material-spinner"/><p>正在读取素材…</p></div>:!error&&!list.length?<div className="survey-material-empty"><FolderOpen size={34} strokeWidth={1.3}/><h2>暂无{filter.source==='granted'?'获授权的':filter.source==='owned'?'自主上传的':'符合条件的'}素材</h2><p>{filter.source==='granted'?'管理员授权后，素材会显示在这里。也可调整类型与检索条件。':'调整筛选条件，或从右上角上传第一份素材。'}</p></div>:<div className="survey-material-grid">{list.map(row=>{const Icon=formats[row.kind].Icon,key=(row.bound?.entryId||'own')+':'+row.id,renaming=rename?.id===row.id&&row.source==='owned';return <article key={key} className="survey-material-card" aria-label={row.name}>
      <div className={'survey-material-card-top is-'+row.kind}><span><Icon size={19} aria-hidden="true"/>{formats[row.kind].label}</span><small>{row.source==='owned'?'自主上传':'授权使用'}</small></div>
      {renaming?<form className="survey-material-rename" onSubmit={event=>{event.preventDefault();void saveName()}}><label>素材名称<input autoFocus className="input" aria-label="修改素材名称" value={name} maxLength={160} disabled={busy} onChange={event=>setName(event.target.value)}/></label>{renameError&&<p role="alert">{renameError}</p>}<div><button type="submit" disabled={busy||!name.trim()||name.trim()===rename.name}>{busy?'保存中…':'保存名称'}</button><button type="button" disabled={busy} onClick={()=>{setRename(null);setRenameError('')}}>取消</button></div></form>:<h2 title={row.name}>{row.name}</h2>}
      {row.bound&&<p className="survey-material-bound">随「{row.bound.title}」授权<span>仅限该量表使用</span></p>}
      <footer><div><span>{sizeLabel(row.size)}</span><time dateTime={row.updatedAt}>{row.source==='owned'?'上传于':'授权于'} {new Date(row.updatedAt).toLocaleDateString('zh-CN')}</time></div><div><button type="button" className="survey-material-preview-button" disabled={locked} onClick={()=>{setPreview(row);setPreviewError('')}}>预览<ArrowRight size={15} aria-hidden="true"/></button>{row.source==='owned'&&!renaming&&<button type="button" disabled={locked} onClick={()=>{setRename(row);setName(row.name);setRenameError('')}}><Pencil size={14} aria-hidden="true"/>改名</button>}</div></footer>
    </article>})}</div>}
    {pages>1&&!error&&<nav className="survey-material-pagination" aria-label="素材分页"><button type="button" disabled={filter.page<=1||loading||locked} onClick={()=>setFilter(value=>({...value,page:value.page-1}))}>上一页</button><span>{filter.page} / {pages}</span><button type="button" disabled={filter.page>=pages||loading||locked} onClick={()=>setFilter(value=>({...value,page:value.page+1}))}>下一页</button></nav>}
    <details className="survey-material-help"><summary>素材使用与授权说明</summary><p>自主上传的素材保持私有；图片可在表单等工具的素材库中选用，发布前仍需填写替代文字和版权依据。视频和文档可在此管理与预览，具体题型的嵌入能力以编制页为准。</p><p>授权素材按当前有效权限显示。随共用库量表授权的媒体仅供该精确版本使用，不提供脱离量表的独立复用；授权失效后不能继续发起预览。</p></details>
    <ModalSurface open={!!upload} onClose={closeUpload} className="survey-material-modal" dismissOnBackdrop><div className="survey-material-dialog" role="dialog" aria-modal="true" aria-labelledby={fileId+'-title'} tabIndex={-1}>
      <header><div><h2 id={fileId+'-title'}>上传{upload?formats[upload].label:''}</h2><p>{upload?formats[upload].hint:''}</p></div><button type="button" aria-label="关闭上传窗口" disabled={busy} onClick={closeUpload}><X size={20}/></button></header>
      <div className="survey-material-dialog-body"><input id={fileId} ref={input} type="file" aria-label="选择素材文件" hidden accept={upload?formats[upload].types.join(','):''} disabled={busy} onChange={event=>{chooseFile(event.target.files?.[0]);event.target.value=''}}/><button type="button" className={'survey-material-file-picker'+(file?' has-file':'')} disabled={busy} onClick={()=>input.current?.click()}>{file?<FileText size={32} strokeWidth={1.5}/>:<Upload size={32} strokeWidth={1.5}/>}<strong>{file?file.name:'点击选择'+(upload?formats[upload].label:'文件')}</strong><span>{file?sizeLabel(file.size)+' · 点击可重新选择':'文件上传后保持私有，仅当前研究者可管理'}</span></button>
      {uploadError&&<p role="alert" className="survey-material-message is-error">{uploadError}</p>}{busy&&<p role="status" className="survey-material-upload-status"><LoaderCircle size={16} className="survey-material-spinner"/>正在上传，请等待结果确认…</p>}
      <p className="survey-material-upload-note">请上传你有权使用的研究素材。此处不转码、不压缩视频。</p></div>
      <footer><button type="button" className="btn-secondary" disabled={busy} onClick={closeUpload}>取消</button><button type="button" className="btn-primary" disabled={!file||busy} onClick={()=>void send()}><Upload size={16}/>{busy?'正在上传…':'开始上传'}</button></footer>
    </div></ModalSurface>
    <ModalSurface open={!!preview} onClose={()=>setPreview(null)} className="survey-material-modal" dismissOnBackdrop><div className="survey-material-dialog is-preview" role="dialog" aria-modal="true" aria-label="素材预览" tabIndex={-1}><header><div><h2>{preview?.name}</h2><p>{preview?formats[preview.kind].label+' · '+sizeLabel(preview.size):''}</p></div><button type="button" aria-label="关闭预览" onClick={()=>setPreview(null)}><X size={20}/></button></header><div className="survey-material-preview">
      {preview?.bound?<><p>随「{preview.bound.title}」授权，仅限该量表使用。</p><ScaleLibraryMediaPreview product="SURVEY" context={{kind:'entries',id:preview.bound.entryId}} item={preview.bound.item}/></>:preview?.kind==='image'?<img src={content(preview.id)} alt={preview.name} onError={()=>setPreviewError('图片暂不可用，请关闭后重新读取列表。')}/>:preview?.kind==='video'?<video src={content(preview.id)} controls preload="metadata" aria-label={preview.name} onError={()=>setPreviewError('视频暂不可用或浏览器不支持此编码，请关闭后重新读取列表。')}/>:preview?.kind==='document'?<><iframe title={preview.name} src={content(preview.id)} sandbox=""/><a href={content(preview.id)} target="_blank" rel="noopener noreferrer">在新页面查看文档</a></>:null}
      {previewError&&<p role="alert">{previewError}</p>}</div></div></ModalSurface>
  </section>
}
