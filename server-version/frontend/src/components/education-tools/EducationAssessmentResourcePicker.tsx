import {useEffect,useRef,useState} from 'react'
import {
  assertEducationAssessmentDirectory,educationAssessmentResourceId,educationAssessmentScopeKey,
  educationAssessmentTrackInput,selectableEducationAssessmentResource,
  type EducationAssessmentResource,type EducationAssessmentResourceAdapter,type EducationAssessmentScope,
} from '../../api/educationAssessmentResources'

type Props={scope:EducationAssessmentScope;adapter?:EducationAssessmentResourceAdapter;disabled:boolean
  onBusy:(busy:boolean)=>void;onRefresh:()=>Promise<unknown>}
const labels={COGNITIVE:'认知测评',SITUATIONAL:'情境测评',BUNDLE:'组合测评'}
const message=(cause:unknown)=>cause instanceof Error?cause.message:'操作未完成，请重新读取后核对。'

export function EducationAssessmentResourcePicker(props:Props){
  return <ScopedPicker key={educationAssessmentScopeKey(props.scope)} {...props}/>
}

function ScopedPicker({scope,adapter,disabled,onBusy,onRefresh}:Props){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[writing,setWriting]=useState(false)
  const [rows,setRows]=useState<EducationAssessmentResource[]>([]),[cursor,setCursor]=useState<string|null>(null)
  const [choice,setChoice]=useState(''),[read,setRead]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [review,setReview]=useState(false),[loadedWith,setLoadedWith]=useState(adapter)
  const epoch=useRef(0),alive=useRef(true),locked=useRef(false),reading=useRef(false)
  const interruptedWrite=useRef(false)
  const current=useRef({adapter,onBusy,onRefresh});current.current={adapter,onBusy,onRefresh}
  useEffect(()=>{
    alive.current=true;epoch.current++;reading.current=false
    setRows([]);setCursor(null);setChoice('');setRead(false);setLoading(false);setError('');setNotice('');setOpen(false)
    // A transport change during a write has an uncertain outcome; refresh first.
    setWriting(false)
    if(interruptedWrite.current){setReview(true);interruptedWrite.current=false}
    return()=>{alive.current=false;epoch.current++;if(locked.current){locked.current=false;interruptedWrite.current=true;current.current.onBusy(false)}}
  },[adapter])
  const visible=loadedWith===adapter?rows:[]
  const selected=visible.find(row=>educationAssessmentResourceId(row)===choice)
  const valid=(token:number,source:typeof adapter)=>alive.current&&token===epoch.current&&current.current.adapter===source
  const load=async(next?:string)=>{
    if(disabled||locked.current||reading.current||!adapter)return
    const token=++epoch.current,source=adapter
    reading.current=true;setOpen(true);setLoading(true);setError('');setNotice('')
    if(!next){setRows([]);setChoice('');setCursor(null);setRead(false)}
    let received=false
    try{
      const data=await source.list(scope,next)
      if(!valid(token,source))return
      received=true
      assertEducationAssessmentDirectory(data,scope)
      const available=data.list.filter(row=>selectableEducationAssessmentResource(row,scope))
      const identities=new Map<string,string>()
      for(const row of [...(next?rows:[]),...available]){
        const key=JSON.stringify([row.family,row.key,row.version]),previous=identities.get(key)
        if(previous&&previous!==row.educationOriginHash){setRows([]);setChoice('');setCursor(null);setRead(false);throw Error('同一固定版本返回了不同内容，请停止添加并重新读取任务配置。')}
        identities.set(key,row.educationOriginHash)
      }
      setRows(old=>Array.from(new Map([...(next?old:[]),...available].map(row=>[educationAssessmentResourceId(row),row])).values()))
      setLoadedWith(source);setCursor(data.nextCursor);setRead(true)
    }catch(cause){if(valid(token,source)){
      if(received){setRows([]);setChoice('');setCursor(null);setRead(false)}
      setError(message(cause))
    }}
    finally{if(valid(token,source)){reading.current=false;setLoading(false)}}
  }
  const close=()=>{
    if(locked.current)return
    epoch.current++;reading.current=false;setOpen(false);setRows([]);setChoice('');setCursor(null);setRead(false);setLoading(false);setError('');setNotice('')
  }
  const add=async()=>{
    if(disabled||locked.current||reading.current||review||!adapter||!selected)return
    const token=epoch.current,source=adapter
    let input:ReturnType<typeof educationAssessmentTrackInput>
    try{input=educationAssessmentTrackInput(scope,selected)}catch(cause){setError(message(cause));return}
    locked.current=true;setWriting(true);onBusy(true);setError('');setNotice('')
    let saved=false
    try{
      await source.addTrack(scope,input);saved=true
      if(!valid(token,source))return
      setChoice('');setRows([]);setCursor(null);setRead(false)
      await current.current.onRefresh()
      if(valid(token,source))setNotice('已加入固定版本，请核对任务配置并按原流程预览、发布。报告仍按该版本的授权与开放条件提供。')
    }catch(cause){if(valid(token,source)){
      setReview(true);setError((saved?'已加入，但任务配置刷新失败。':'添加结果尚未确认。')+' 请先重新读取任务配置核对，不要重复添加。 '+message(cause))
    }}finally{if(valid(token,source)){locked.current=false;setWriting(false);current.current.onBusy(false)}}
  }
  const recover=async()=>{
    if(disabled||locked.current)return
    const token=epoch.current,source=adapter
    locked.current=true;setWriting(true);onBusy(true)
    try{
      await current.current.onRefresh()
      if(valid(token,source)){setReview(false);setError('');setRows([]);setChoice('');setCursor(null);setRead(false);setNotice('已重新读取任务配置，请先核对是否已加入；确需添加时重新读取目录并选择。')}
    }catch(cause){if(valid(token,source))setError(message(cause))}
    finally{if(valid(token,source)){locked.current=false;setWriting(false);current.current.onBusy(false)}}
  }
  const prefix=scope.product==='SCHOOL'?'hs':'ht'
  return <section className={prefix==='hs'?'hs-task-detail':'ht-task'} aria-label="已授权认知、情境与组合测评">
    <h4>已授权认知、情境与组合测评</h4>
    <p>仅使用当前学校和入口已获授权的固定版本。工具批准、任务发布及本人报告开放分别校验。</p>
    {!adapter?<p role="status">授权测评目录暂不可用，请联系学校管理员核对。具体工具仍须独立批准和授权。</p>:<>
      <button type="button" disabled={disabled||loading||writing||!scope.actorKey||review} onClick={()=>void load()}>读取已授权测评目录</button>
      {open&&<button type="button" disabled={writing} onClick={close}>关闭测评目录</button>}
      {loading&&<p role="status">正在读取本校、本入口的授权目录…</p>}
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {review&&<button type="button" disabled={disabled||writing} onClick={()=>void recover()}>重新读取任务配置（核对添加结果）</button>}
      {open&&read&&!loading&&!error&&visible.length===0&&<p>{cursor?'本页暂无获授权工具，可继续加载。':'当前学校及入口尚无获授权的认知、情境或组合工具。请由有权限的管理员完成工具批准和组织授权。'}</p>}
      {open&&cursor&&<button type="button" disabled={disabled||loading||writing||review} onClick={()=>void load(cursor)}>继续加载授权测评</button>}
      {open&&visible.length>0&&<>
        <label className={`${prefix}-field`}><span>已授权测评 · 精确版本</span>
          <select value={choice} disabled={disabled||loading||writing||review} onChange={event=>setChoice(event.target.value)}>
            <option value="">请选择已获本校和入口授权的工具</option>
            {visible.map(row=><option key={educationAssessmentResourceId(row)} value={educationAssessmentResourceId(row)}>{row.title} · {labels[row.family]} · {row.version} · 内容 {row.educationOriginHash.slice(0,8)}</option>)}
          </select>
        </label>
        {selected&&<details><summary>核对固定内容、参数与报告版本</summary>
          {selected.units.length===0&&<p>此组合不含测量 C/P/R 单元，按固定表单流程提供完成确认；不生成心理分数或报告。</p>}
          <ul>{selected.units.map((unit,index)=><li key={unit.itemId}>单元 {index+1} · {unit.family}
            <dl><dt>内容 C</dt><dd>{unit.measurement.releaseId} · {unit.measurement.contentHash}</dd>
              <dt>参数 P</dt><dd>{unit.references.length?unit.references.map(ref=>`${ref.releaseId} · ${ref.contentHash}`).join('；'):'明确未选参数版本'}</dd>
              <dt>报告 R</dt><dd>{unit.report?`${unit.report.releaseId} · ${unit.report.contentHash}`:'明确未选报告版本'}</dd></dl>
          </li>)}</ul>
        </details>}
        <button type="button" disabled={disabled||loading||writing||review||!selected} onClick={()=>void add()}>加入已授权固定版本</button>
      </>}
    </>}
  </section>
}
