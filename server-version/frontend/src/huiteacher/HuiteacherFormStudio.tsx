import { useCallback,useEffect,useState } from 'react'
import { ResearchFormEditor } from '../survey/ResearchFormEditor'
import type { FormDraft } from '../survey/builder.types'

type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Summary={id:string;title:string;status:'DRAFT'|'PUBLISHED';revision:number;definitionDigest:string}
type Full=Summary&{definition:FormDraft}
type Issue={path:string;message:string;severity:'error'|'warning'}

export function HuiteacherFormStudio({organizationId,api}:{
  organizationId:string;api:Api
}){
  const base='/organizations/'+organizationId+'/forms'
  const [forms,setForms]=useState<Summary[]>([])
  const [active,setActive]=useState<Full|null>(null)
  const [draft,setDraft]=useState<FormDraft|null>(null)
  const [title,setTitle]=useState('')
  const [newTitle,setNewTitle]=useState('')
  const [busy,setBusy]=useState(false)
  const [dirty,setDirty]=useState(false)
  const [notice,setNotice]=useState('')
  const [errors,setErrors]=useState<Issue[]>([])
  const refresh=useCallback(async()=>{
    const result=await api<{list:Summary[]}>(base)
    setForms(result.list)
  },[base,api])
  useEffect(()=>{
    let mounted=true
    setForms([]);setActive(null);setDraft(null);setDirty(false);setNotice('')
    void api<{list:Summary[]}>(base).then(data=>{
      if(mounted)setForms(data.list)
    }).catch(e=>{if(mounted)setNotice(e instanceof Error?e.message:'Form 列表读取失败')})
    return ()=>{mounted=false}
  },[base,api])
  const action=async(task:()=>Promise<void>)=>{
    setBusy(true);setNotice('');setErrors([])
    try{await task()}
    catch(e){setNotice(e instanceof Error?e.message:'Form 操作失败')}
    finally{setBusy(false)}
  }
  const load=async(id:string)=>{
    if(dirty&&!window.confirm('当前表单草稿尚未保存，确定放弃修改吗？'))return
    await action(async()=>{
      const value=await api<Full>(base+'/'+id)
      setActive(value);setDraft(value.definition);setTitle(value.title);setDirty(false)
    })
  }
  const create=async()=>{
    await action(async()=>{
      const created=await api<{id:string}>(base,'POST',{title:newTitle.trim()})
      setNewTitle('');await refresh()
      const full=await api<Full>(base+'/'+created.id)
      setActive(full);setDraft(full.definition);setTitle(full.title);setDirty(false)
      setNotice('Form 草稿已建立。请添加页面和题目；发布不会产生任何测评得分。')
    })
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
      setNotice('Form V2 已保存；发布后定义不可改写。')
    })
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
      await refresh();setNotice('表单已发布并冻结。下一阶段接入授权任务与正式 FINAL。')
    })
  }
  return <section className="ht-panel" aria-label="Huiteacher Form 工具编制">
    <h2>评价表单编制 · Survey Form V2</h2>
    <p>复用科研版专业题型与验证规则，数据及草稿属于 Huiteacher 学校；此处不能访问 Survey 研究项目。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <div className="ht-inline"><label className="ht-field"><span>新表单名称</span>
      <input value={newTitle} maxLength={200} onChange={e=>setNewTitle(e.target.value)}/></label>
      <button disabled={busy||!newTitle.trim()} onClick={()=>void create()}>创建 Form</button></div>
    <div className="ht-inline">{forms.map(item=><button type="button" key={item.id}
      disabled={busy} aria-pressed={active?.id===item.id} onClick={()=>void load(item.id)}>
      {item.title} · {item.status==='PUBLISHED'?'已发布':'草稿'}
    </button>)}</div>
    {active&&draft&&<div>
      <div className="ht-inline"><label className="ht-field"><span>表单标题</span>
        <input value={title} disabled={active.status==='PUBLISHED'}
          onChange={e=>{setTitle(e.target.value);setDirty(true)}}/></label>
        <span className="ht-tag">修订 {active.revision} · {active.status==='DRAFT'?'待发布':'冻结发布'}</span>
      </div>
      {active.status==='DRAFT'
        ?<ResearchFormEditor value={draft} onChange={value=>{setDraft(value);setDirty(true)}}/>
        :<p>已发布的题目定义不可再修改。请创建新 Form 版本进行更新。</p>}
      {errors.length>0&&<div role="alert">{errors.map((i,k)=><p key={k}>{i.path}：{i.message}</p>)}</div>}
      <div className="ht-inline">
        <button disabled={busy||!dirty||active.status!=='DRAFT'} onClick={()=>void save()}>保存草稿</button>
        <button disabled={busy||dirty||active.status!=='DRAFT'} onClick={()=>void publish()}>审核并发布</button>
      </div>
      <p className="ht-muted">正式作答任务、数据提交与群体报告必须经 Assessment Run 和后续业务授权；表单发布并不等于评价任务已开放。</p>
    </div>}
  </section>
}
