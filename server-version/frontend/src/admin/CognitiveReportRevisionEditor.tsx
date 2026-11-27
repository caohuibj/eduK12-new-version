import {useRef,useState} from 'react'
import api from '../api/client'
import {apiErrorMessage} from '../utils/apiErrorMessage'

const root='/admin/permissions/cognitive-intake/reports'
const audiences={respondent:'实际作答者',subject:'报告对象',teacher:'教师',researcher:'研究者'} as const
const capabilities={numericScores:'数值',references:'参考',scoreDerivedLabels:'分档',individualInterpretations:'个体解读',
  educationalContent:'教育建议',artwork:'配图'} as const
type Audience=keyof typeof audiences
type Capability=keyof typeof capabilities
type Identity={id:string;name:string;testType:string;configVersion:string;engineVersion:string;scoringVersion:string;
  profiles:Array<{key:string;estimatedMinutes:[number,number]}>}
type SourceDisplay={id:string;title:string;instruction:string;introduction:string;disclaimer:string;
  practicalTips:string[];reportVisibility:Partial<Record<Audience,Partial<Record<Capability,boolean>>>>}
type Preview={previewHash:string;source:{id:string;name:string;version:string;measurementReleaseId:string};
  effectiveDisclosure:{audiences:SourceDisplay['reportVisibility']}}
const emptyVisibility=Object.fromEntries(Object.keys(capabilities).map(key=>[key,false])) as Record<Capability,boolean>
const initialVisibility=()=>Object.fromEntries(Object.keys(audiences).map(key=>[key,{...emptyVisibility}])) as Record<Audience,Record<Capability,boolean>>
const initialDraft={version:'',title:'',instruction:'',introduction:'',disclaimer:'',tips:''}
const displayFields=[
  ['version','新报告版本'],['title','新报告名称'],['instruction','指导语'],
  ['introduction','报告说明'],['disclaimer','免责声明'],['tips','建议（每行一条）'],
] as const

export default function CognitiveReportRevisionEditor({onSelectForApproval}:{onSelectForApproval:(source:Identity)=>void}){
  const [sources,setSources]=useState<Identity[]>([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(true)
  const [selectedId,setSelectedId]=useState(''),[draft,setDraft]=useState(initialDraft),[visibility,setVisibility]=useState(initialVisibility)
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState('')
  const [created,setCreated]=useState<Identity|null>(null)
  const operation=useRef(false)
  const source=sources.find(row=>row.id===selectedId)
  function changeDraft(key:keyof typeof draft,value:string){setPreview(null);setCreated(null);setDraft(current=>({...current,[key]:value}))}
  function release(){
    const {tips,...body}=draft
    return {...body,practicalTips:tips.split('\n').map(line=>line.trim()).filter(Boolean),
      reportVisibility:{schemaVersion:1,policyVersion:draft.version,unknownAudience:'DENY',audiences:visibility}}
  }
  async function run(work:()=>Promise<void>){
    if(operation.current)return
    operation.current=true;setBusy(true);setFailure('')
    try{await work()}catch(error){setFailure((error as {code?:unknown}|null)?.code==='ADMIN_KEY_STEP_UP_REQUIRED'
      ?'请在“安装操作验证”完成管理员双因素验证，再发布这份预览。':apiErrorMessage(error))}
    finally{operation.current=false;setBusy(false)}
  }
  const load=()=>run(async()=>{
    const response=await api.get<{rows:Identity[];hasMore:boolean}>(root+'?page='+(page+1))
    if(response.code!==0||!response.data||!Array.isArray(response.data.rows))throw Error(response.message||'无法读取报告来源')
    setSources(current=>[...new Map([...current,...response.data!.rows].map(row=>[row.id,row])).values()])
    setHasMore(response.data.hasMore);setPage(page+1)
  })
  const select=(id:string)=>run(async()=>{
    setSelectedId('');setPreview(null);setCreated(null)
    if(!id){setDraft(initialDraft);setVisibility(initialVisibility());return}
    const response=await api.get<SourceDisplay>(root+'/'+encodeURIComponent(id))
    const saved=response.data
    if(response.code!==0||saved?.id!==id)throw Error(response.message||'无法核对原报告显示配置')
    setDraft({version:'',title:saved.title,instruction:saved.instruction,introduction:saved.introduction,
      disclaimer:saved.disclaimer,tips:saved.practicalTips.join('\n')})
    const next=initialVisibility()
    for(const audience of Object.keys(audiences) as Audience[]){
      for(const capability of Object.keys(capabilities) as Capability[]){
        next[audience][capability]=saved.reportVisibility[audience]?.[capability]===true
      }
    }
    setVisibility(next);setSelectedId(id)
  })
  const previewRelease=()=>run(async()=>{
    if(!source)return
    setPreview(null);setCreated(null)
    const response=await api.post<Preview>(root+'/'+encodeURIComponent(source.id)+'/preview',release())
    if(response.code!==0||response.data?.source.id!==source.id||!/^[a-f0-9]{64}$/.test(response.data.previewHash))
      throw Error(response.message||'报告预览未绑定到所选配置')
    setPreview(response.data)
  })
  const publish=()=>run(async()=>{
    if(!preview||!source)return
    const response=await api.post<{id:string;name:string;version:string;measurementReleaseId:string}>(
      root+'/'+encodeURIComponent(source.id)+'/publish',{release:release(),expectedPreviewHash:preview.previewHash})
    if(response.code!==0||!response.data||response.data.measurementReleaseId!==preview.source.measurementReleaseId
      ||response.data.version!==draft.version)throw Error(response.message||'报告发布回执与预览不一致')
    setCreated({...source,id:response.data.id,name:response.data.name,configVersion:response.data.version})
    setPreview(null)
  })

  return <section className="sys-panel" aria-label="认知报告修订">
    <h2>认知报告修订</h2>
    <p>从已发布配置复制报告，只编辑指导语、反馈和可见范围。引擎、计分、参数与已入场作答保持冻结。</p>
    <button type="button" disabled={busy||!hasMore} onClick={()=>void load()}>{page?'加载更多已发布配置':'读取已发布配置'}</button>
    {failure&&<p role="alert" className="sys-message sys-error">{failure}</p>}
    {sources.length>0&&<label className="system-field">原始认知配置<select value={selectedId} disabled={busy} onChange={event=>void select(event.target.value)}><option value="">选择已发布配置</option>{sources.map(row=><option key={row.id} value={row.id}>{row.name} · {row.configVersion}</option>)}</select></label>}
    {source&&<button type="button" disabled={busy} onClick={()=>onSelectForApproval(source)}>核对所选配置的 Profile 准入</button>}
    {source&&<form onSubmit={event=>{event.preventDefault();void previewRelease()}}>
      <fieldset disabled={busy}>
        <legend>报告内容</legend>
        {displayFields.map(([key,label])=><label key={key} className="system-field">{label}
          {key==='title'||key==='version'
            ?<input maxLength={key==='title'?200:80} required value={draft[key]} onChange={event=>changeDraft(key,event.target.value)}/>
            :<textarea maxLength={key==='tips'?20000:4000} required={key==='disclaimer'} rows={2} value={draft[key]} onChange={event=>changeDraft(key,event.target.value)}/>}
        </label>)}
      </fieldset>
      {Object.entries(audiences).map(([audience,label])=><fieldset key={audience} disabled={busy}>
        <legend>{label}可见内容</legend>
        {Object.entries(capabilities).map(([capability,title])=><label key={capability}>
          <input type="checkbox" checked={visibility[audience as Audience][capability as Capability]} onChange={event=>{
            setPreview(null);setCreated(null)
            const checked=event.target.checked
            setVisibility(current=>({...current,[audience]:{...current[audience as Audience],[capability]:checked}}))
          }}/>{title}
        </label>)}
      </fieldset>)}
      <button type="submit" disabled={busy}>预览报告修订</button>
    </form>}
    {preview&&<section aria-label="报告修订预览"><h3>{draft.title}</h3>
      <p>保留 {preview.source.name} · {preview.source.version} 的测量配置。</p>
      <p>{draft.introduction}</p><p>{draft.disclaimer}</p>
      <dl>{(Object.keys(audiences) as Audience[]).map(audience=>{
        const allowed=(Object.keys(capabilities) as Capability[]).filter(capability=>preview.effectiveDisclosure.audiences[audience]?.[capability])
        return <div key={audience}><dt>{audiences[audience]}</dt><dd>{allowed.map(capability=>capabilities[capability]).join('、')||'无'}</dd></div>
      })}</dl>
      <button type="button" className="sys-primary" disabled={busy} onClick={()=>void publish()}>发布报告新版本</button>
    </section>}
    {created&&<div role="status"><p>报告 {created.configVersion} 已发布，等待独立入口审批。</p>
      <button type="button" onClick={()=>onSelectForApproval(created)}>去核对新版本的 Profile 准入</button>
    </div>}
  </section>
}
