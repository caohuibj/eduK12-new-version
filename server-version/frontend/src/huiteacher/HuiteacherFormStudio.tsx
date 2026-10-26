import {SchoolTaskHelp as ManagementHelp} from '../school/SchoolTaskHelp'
import { useCallback,useEffect,useRef,useState } from 'react'
import { ResearchFormEditor } from '../survey/ResearchFormEditor'
import type { FormDraft } from '../survey/builder.types'

type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Summary={id:string;title:string;status:'DRAFT'|'PUBLISHED';revision:number;definitionDigest:string}
type Full=Summary&{definition:FormDraft}
type Issue={path:string;message:string;severity:'error'|'warning'}

export function HuiteacherFormStudio({organizationId,api,onDraftStateChange}:{
  organizationId:string;api:Api;onDraftStateChange?:(state:{dirty:boolean;writing:boolean})=>void
}){
  const base='/organizations/'+organizationId+'/forms'
  const [forms,setForms]=useState<Summary[]>([])
  const [active,setActive]=useState<Full|null>(null)
  const [draft,setDraft]=useState<FormDraft|null>(null)
  const [title,setTitle]=useState('')
  const [newTitle,setNewTitle]=useState('')
  const [busy,setBusy]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [writing,setWriting]=useState(false)
  const [listLoading,setListLoading]=useState(true)
  const [listError,setListError]=useState('')
  const hasUnsavedChanges=dirty||!!newTitle.trim()
  useEffect(()=>{
    onDraftStateChange?.({dirty:hasUnsavedChanges,writing})
  },[hasUnsavedChanges,writing,onDraftStateChange])
  useEffect(()=>()=>onDraftStateChange?.({dirty:false,writing:false}),[onDraftStateChange])
  useEffect(()=>{
    if(!hasUnsavedChanges&&!writing)return
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return ()=>window.removeEventListener('beforeunload',protect)
  },[hasUnsavedChanges,writing])
  const [notice,setNotice]=useState('')
  const [errors,setErrors]=useState<Issue[]>([])
  const refresh=useCallback(async()=>{
    const result=await api<{list:Summary[]}>(base)
    setForms(result.list)
  },[base,api])
  useEffect(()=>{
    let mounted=true
    setForms([]);setActive(null);setDraft(null);setDirty(false);setNotice('');setListLoading(true);setListError('')
    void api<{list:Summary[]}>(base).then(data=>{
      if(mounted)setForms(data.list)
    }).catch(e=>{if(mounted)setListError(e instanceof Error?e.message:'表单列表读取失败')}).finally(()=>{if(mounted)setListLoading(false)})
    return ()=>{mounted=false}
  },[base,api])
  const actionPending=useRef(false)
  const action=async(task:()=>Promise<void>,write=false)=>{
    if(actionPending.current)return
    actionPending.current=true
    setBusy(true);setWriting(write);setNotice('');setErrors([])
    try{await task()}
    catch(e){setNotice(e instanceof Error?e.message:'Form 操作失败')}
    finally{actionPending.current=false;setBusy(false);setWriting(false)}
  }
  const load=async(id:string)=>{
    if(dirty&&!window.confirm('当前表单草稿尚未保存，确定放弃修改吗？'))return
    await action(async()=>{
      const value=await api<Full>(base+'/'+id)
      setActive(value);setDraft(value.definition);setTitle(value.title);setDirty(false)
    })
  }
  const create=async()=>{
    if(dirty&&!window.confirm('当前表单草稿尚未保存，确定放弃修改并新建表单吗？'))return
    await action(async()=>{
      const created=await api<{id:string}>(base,'POST',{title:newTitle.trim()})
      setNewTitle('');await refresh()
      const full=await api<Full>(base+'/'+created.id)
      setActive(full);setDraft(full.definition);setTitle(full.title);setDirty(false)
      setNotice('表单草稿已建立。请添加页面和题目；发布不会产生任何测评得分。')
    },true)
  }
  const save=async()=>{
    if(!active||!draft||!dirty||active.status!=='DRAFT')return
    await action(async()=>{
      const current=active
      await api(base+'/'+current.id,'PUT',{
        expectedRevision:current.revision,title:title.trim(),definition:draft,
      })
      const full=await api<Full>(base+'/'+current.id)
      setActive(full);setDraft(full.definition);setTitle(full.title);setDirty(false)
      await refresh()
      setNotice('表单已保存；发布后定义不可改写。')
    },true)
  }
  const publish=async()=>{
    if(!active||active.status!=='DRAFT'||dirty)return
    if(!window.confirm('发布后题目与答案定义将冻结。请确认版权与问卷内容已经审核。'))return
    await action(async()=>{
      try{
        await api(base+'/'+active.id+'/publish','POST',{expectedRevision:active.revision})
      }catch(error){
        // The detailed Survey V2 validation issues are returned server-side.
        const detail=error instanceof Error?error.message:'请修改表单'
        setErrors([{path:'definition',message:detail,severity:'error'}])
        throw error
      }
      const value=await api<Full>(base+'/'+active.id)
      setActive(value);setDraft(value.definition);setDirty(false)
      await refresh();setNotice('表单已发布并冻结。请在评价活动中配置并发布正式任务。')
    },true)
  }
  return <section className="ht-panel ht-admin-panel ht-school-form-studio" aria-label="Huiteacher Form 工具编制">
    <header className="ht-section-heading"><h2>评价表单编制</h2><ManagementHelp label="学校表单编制说明" buttonText=""><p>复用科研版专业题型与验证规则，数据及草稿属于 Huiteacher 学校；此处不能访问 Survey 研究项目。</p></ManagementHelp></header>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <div className="ht-inline ht-form-create-row"><label className="ht-field"><span>新表单名称</span>
      <input disabled={busy} value={newTitle} maxLength={200} onChange={e=>setNewTitle(e.target.value)}/></label>
      <button disabled={busy||!newTitle.trim()} onClick={()=>void create()}>创建表单</button></div>
    {listLoading&&<p role="status">正在读取本校表单…</p>}
    {listError&&<div role="alert">{listError}<button disabled={busy} onClick={()=>void action(async()=>{await refresh();setListError('')})}>重试表单列表</button></div>}
    {!listLoading&&!listError&&forms.length===0&&<p className="ht-empty">本校尚无表单，可以先创建草稿。</p>}
    <div className="ht-school-form-list">{forms.map(item=><button type="button" key={item.id}
      disabled={busy} aria-pressed={active?.id===item.id} onClick={()=>void load(item.id)}>
      <strong>{item.title}</strong><span className="ht-tag"> · {item.status==='PUBLISHED'?'已发布':'草稿'}</span>
    </button>)}</div>
    {active&&draft&&<div>
      <div className="ht-inline"><label className="ht-field"><span>表单标题</span>
        <input value={title} disabled={busy||active.status==='PUBLISHED'}
          onChange={e=>{setTitle(e.target.value);setDirty(true)}}/></label>
        <span className="ht-tag">修订 {active.revision} · {active.status==='DRAFT'?'待发布':'冻结发布'}</span>
      </div>
      {active.status==='DRAFT'
        ?<fieldset disabled={busy}><legend>表单内容</legend><ResearchFormEditor value={draft} onChange={value=>{setDraft(value);setDirty(true)}}/></fieldset>
        :<p>已发布的题目定义不可再修改。如需更新，请另建表单草稿。</p>}
      {errors.length>0&&<div role="alert">{errors.map((i,k)=><p key={k}>{i.path}：{i.message}</p>)}</div>}
      <div className="ht-inline">
        <button disabled={busy||!dirty||active.status!=='DRAFT'} onClick={()=>void save()}>保存草稿</button>
        <button disabled={busy||dirty||active.status!=='DRAFT'} onClick={()=>void publish()}>审核并发布</button>
      </div>
      <p className="ht-muted">正式作答任务、数据提交与群体报告必须经正式评价任务和后续业务授权；表单发布并不等于评价任务已开放。</p>
    </div>}
  </section>
}
