import {useEffect,useRef,useState} from 'react'

export type WaveContentSelection={instrumentId:string;reportReleaseId?:string;references:{releaseId:string;entryKey:string;priority:number}[]}
export type FrozenWaveContent={draftId:string;instrumentKey:string;title:string;measurementRelease:null|{releaseId:string;contentHash:string;measurementHash:string};contentSelection:null|{referencePolicy:{policyVersion:string;measurementReleaseId:string;choices:{releaseId:string;contentHash:string;entryKey:string;priority:number;metricKey:string;referenceKind:string}[]};reportRelease?:{releaseId:string;contentHash:string}}}
type Entry={entryKey:string;metricKey:string;referenceKind:string;population:Record<string,unknown>;limitations?:string[]}
type Option={releaseId:string;key:string;version:string;contentHash:string;status:'PUBLISHED';title?:string;audience?:string;language?:string;entries?:Entry[]}
type Catalog={instrumentId:string;instrumentKey:string;draftRevision:number;waveRevision:number;measurement:{releaseId:string;contentHash:string;version:string};layer:'REPORT'|'REFERENCE';page:number;pageSize:number;hasMore:boolean;options:Option[]}
export type WaveContentRequest=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
type Tool={id:string;title:string;kind:string;revision?:number}
type Props={base:string;revision:number;tools:Tool[];request:WaveContentRequest;value:WaveContentSelection[];onChange:(value:WaveContentSelection[])=>void;disabled?:boolean;frozen?:FrozenWaveContent[];published:boolean}
const problem=(error:unknown)=>error instanceof Error?error.message:'版本目录读取失败'
const identity=(releaseId:string,entryKey:string)=>JSON.stringify([releaseId,entryKey])

export function SurveyWaveContentSelection({base,revision,tools,request,value,onChange,disabled=false,frozen,published}:Props){
  return <section aria-label="研究者报告与参考版本" className="border rounded-lg p-3 space-y-3">
    <h4 className="font-semibold">研究者报告与参考版本</h4>
    <p className="text-sm">仅供当前研究者读取；模板标注的预期受众不授予学生、家长或教师访问权，也不改变上方被试原始指标反馈。</p>
    {published?<>
      <p>版本选择已随研究定义冻结，只读，不随新版本更新。</p>
      {frozen===undefined?<p role="status">尚未取得已冻结版本摘要，请刷新核对；不能从当前草稿推断。</p>:frozen.map(unit=><article key={unit.draftId} className="border-t pt-2 break-words">
        <h5>{unit.title}（{unit.instrumentKey}）</h5>
        <p>测量版本：{unit.measurementRelease?.releaseId??'未记录'}</p>
        <p>报告版本：{unit.contentSelection?.reportRelease?.releaseId??'未选择'}</p>
        {unit.contentSelection?.referencePolicy.choices.length?unit.contentSelection.referencePolicy.choices.map(choice=><p key={identity(choice.releaseId,choice.entryKey)}>{choice.metricKey} · {choice.referenceKind} · 参考 {choice.releaseId} · 优先级 {choice.priority}</p>):<p>参考版本：未选择</p>}
        <details><summary>冻结技术标识</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({measurement:unit.measurementRelease,selection:unit.contentSelection},null,2)}</pre></details>
      </article>)}
      {frozen?.length===0&&<p>此冻结版本没有测量报告或参考绑定记录。</p>}
    </>:<>
      <p className="text-sm">仅在本次“冻结研究定义”时提交，不随“保存波次草稿”保存；切换波次或更新工具后需重新选择。默认不选，不自动使用最新版本。</p>
      <p className="text-sm">参考仅限本项目私有版本。当前研究不提供年龄等人口背景；缺少必要背景或匹配冲突时不输出比较，不默认套用总体常模。</p>
      {tools.filter(tool=>tool.kind!=='FORM').map(tool=><ToolChoices key={tool.id} base={base} revision={revision} tool={tool} request={request} disabled={disabled}
        value={value.find(unit=>unit.instrumentId===tool.id)??{instrumentId:tool.id,references:[]}}
        onChange={next=>onChange([...value.filter(unit=>unit.instrumentId!==tool.id),...(next.reportReleaseId||next.references.length?[next]:[])])}/>)}
      {!tools.some(tool=>tool.kind!=='FORM')&&<p>请先保存本波次的测量工具；普通表单不绑定测量报告或参考。</p>}
    </>}
  </section>
}
function ToolChoices({base,revision,tool,request,value,onChange,disabled}:{base:string;revision:number;tool:Tool;request:WaveContentRequest;value:WaveContentSelection;onChange:(value:WaveContentSelection)=>void;disabled:boolean}){
  const [catalogs,setCatalogs]=useState<Partial<Record<Catalog['layer'],Catalog>>>({})
  const [error,setError]=useState(''),[loading,setLoading]=useState(false)
  const epoch=useRef(0),lock=useRef(false)
  useEffect(()=>()=>{epoch.current++},[])
  async function load(layer:Catalog['layer'],page=1){
    if(disabled||lock.current)return
    lock.current=true;setLoading(true);setError('');const token=++epoch.current
    try{
      const result=await request<Catalog>(base+'/content-options?'+new URLSearchParams({instrumentId:tool.id,layer,page:String(page)}))
      if(token!==epoch.current)return
      if(result.instrumentId!==tool.id||result.waveRevision!==revision||result.layer!==layer||result.page!==page||!Array.isArray(result.options)
        ||(tool.revision!==undefined&&result.draftRevision!==tool.revision)||!result.measurement?.releaseId||!result.measurement.contentHash)
        throw new Error('测量或波次修订已变化，请重新读取当前波次和工具后选择。')
      if(result.options.some(option=>!option.releaseId||!option.contentHash||option.status!=='PUBLISHED'||!option.version
        ||(layer==='REPORT'?typeof option.audience!=='string'||typeof option.language!=='string'
          :!Array.isArray(option.entries)||option.entries.some(entry=>!entry.entryKey||!entry.metricKey||!entry.referenceKind))))
        throw new Error('版本目录响应不完整，未采用其中的选项，请重试读取。')
      const other=catalogs[layer==='REPORT'?'REFERENCE':'REPORT']
      const previous=catalogs[layer]
      if([other,previous].some(old=>old&&(old.measurement.releaseId!==result.measurement.releaseId||old.measurement.contentHash!==result.measurement.contentHash)))
        throw new Error('当前测量版本已变化，请重新读取波次后选择；原选择未被替换。')
      setCatalogs(current=>({...current,[layer]:{...result,options:page===1?result.options:[...new Map([...(current[layer]?.options??[]),...result.options].map(option=>[option.releaseId,option])).values()]}}))
    }catch(cause){if(token===epoch.current)setError(problem(cause))}
    finally{if(token===epoch.current){lock.current=false;setLoading(false)}}
  }
  const reports=catalogs.REPORT,references=catalogs.REFERENCE
  return <fieldset disabled={disabled||loading} className="border rounded p-3 space-y-2"><legend>{tool.title} · {tool.kind}</legend>
    {error&&<p role="alert">{error} 原选择保留；目录失败不代表没有可用版本。</p>}
    <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={()=>void load('REPORT')}>读取 {tool.title} 的报告版本</button><button type="button" className="btn-secondary" onClick={()=>void load('REFERENCE')}>读取 {tool.title} 的参考版本</button></div>
    {loading&&<p role="status">正在读取精确兼容版本…</p>}
    {(reports||references)&&<p className="text-sm">本体版本 {(reports??references)!.measurement.version} · {(reports??references)!.measurement.releaseId}</p>}
    {reports&&<>
      <label>报告版本 · {tool.title}<select className="input block" value={value.reportReleaseId??''} onChange={event=>onChange({...value,reportReleaseId:event.target.value||undefined})}>
        <option value="">不选择报告</option>
        {value.reportReleaseId&&!reports.options.some(option=>option.releaseId===value.reportReleaseId)&&<option value={value.reportReleaseId}>原选择尚未在当前列表中核实：{value.reportReleaseId}</option>}
        {reports.options.map(option=><option key={option.releaseId} value={option.releaseId}>{option.title||option.key} · {option.version} · 预期受众 {option.audience} · {option.language}</option>)}
      </select></label>
      {!reports.options.length&&<p>当前没有兼容的已发布项目私有报告。</p>}
      {reports.hasMore&&<button type="button" onClick={()=>void load('REPORT',reports.page+1)}>加载更多报告版本 · {tool.title}</button>}
    </>}
    {references&&<>
      {!references.options.length&&<p>当前没有兼容的已发布项目私有参考。</p>}
      {references.options.flatMap(option=>(option.entries??[]).map(entry=>{
        const selected=value.references.find(choice=>identity(choice.releaseId,choice.entryKey)===identity(option.releaseId,entry.entryKey))
        const set=(checked:boolean,priority=selected?.priority??0)=>onChange({...value,references:[...value.references.filter(choice=>identity(choice.releaseId,choice.entryKey)!==identity(option.releaseId,entry.entryKey)),...(checked?[{releaseId:option.releaseId,entryKey:entry.entryKey,priority}]:[])]})
        return <div key={identity(option.releaseId,entry.entryKey)}><label><input type="checkbox" checked={!!selected} onChange={event=>set(event.target.checked)}/> {option.key} · {option.version} · {entry.metricKey} · {entry.referenceKind}</label>
          <p>适用范围：{typeof entry.population?.description==='string'?entry.population.description:'请按参考适用条件核对；不推断人口背景'}</p>{entry.limitations?.map((line,index)=><p key={index}>{line}</p>)}
          <label>优先级 · {option.version} · {entry.metricKey}<input className="input" type="number" step="1" disabled={!selected} value={selected?.priority??0} onChange={event=>{const priority=Number(event.target.value);if(event.target.value.trim()&&Number.isSafeInteger(priority))set(true,priority)}}/></label>
        </div>
      }))}
      {references.hasMore&&<button type="button" onClick={()=>void load('REFERENCE',references.page+1)}>加载更多参考版本 · {tool.title}</button>}
      {value.references.some(choice=>!references.options.some(option=>option.releaseId===choice.releaseId&&option.entries?.some(entry=>entry.entryKey===choice.entryKey)))&&<p role="status">部分原参考选择尚未在当前列表中核实，未自动删除。请继续加载或明确清空。</p>}
    </>}
    {(value.reportReleaseId||value.references.length>0)&&<button type="button" onClick={()=>onChange({instrumentId:tool.id,references:[]})}>清空 {tool.title} 的报告与参考选择</button>}
  </fieldset>
}
