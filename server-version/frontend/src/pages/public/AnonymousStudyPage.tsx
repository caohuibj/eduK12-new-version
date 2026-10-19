import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { publicStudyApi, studyIdentityKey, type AcceptResearchConsent, type RequestResearchWithdrawal, type ResearchParticipation, type StudyHome, type StudyWave } from '../../api/anonymousStudy'

function ResearchConsentPanel({studyId,credential}:{studyId:string;credential:string}) {
  const [research,setResearch]=useState<ResearchParticipation|null>(null)
  const [agreed,setAgreed]=useState(false),[pending,setPending]=useState(true),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0)
  const epoch=useRef(0),working=useRef(false)
  const invalidateResearchEpoch=useCallback(()=>{epoch.current++},[])
  const acceptIntent=useRef<AcceptResearchConsent|null>(null),withdrawIntent=useRef<RequestResearchWithdrawal|null>(null)
  useEffect(()=>{
    const current=++epoch.current
    working.current=true;acceptIntent.current=null;withdrawIntent.current=null
    setResearch(null);setAgreed(false);setError('');setUncertain(false);setPending(true)
    void publicStudyApi(credential).researchConsent(studyId).then(value=>{
      if(current===epoch.current)setResearch(value)
    }).catch(e=>{
      if(current===epoch.current)setError(e instanceof Error && 'status' in e && (e.status===401 || e.status===403 || e.status===404)
        ? '暂无法核验研究访问权限。若身份码已停用，请联系原研究发布方；不能用短显示码办理退出。'
        : '研究同意状态暂不可用。你仍可作答和查看个人报告。')
    }).finally(()=>{if(current===epoch.current){working.current=false;setPending(false)}})
    return invalidateResearchEpoch
  },[studyId,credential,reload,invalidateResearchEpoch])
  const act=async(work:()=>Promise<ResearchParticipation>)=>{
    if(working.current)return
    const current=epoch.current;working.current=true;setPending(true);setError('')
    try {
      const value=await work()
      if(current!==epoch.current)return
      setResearch(value);setAgreed(false);setUncertain(false);acceptIntent.current=null;withdrawIntent.current=null
    } catch(e) {
      if(current===epoch.current){setUncertain(true);setError(`${e instanceof Error?e.message:'研究操作失败'}。操作结果尚未确认，可重试同一操作或刷新研究状态。`)}
    } finally {if(current===epoch.current){working.current=false;setPending(false)}}
  }
  const accept=()=>{
    const version=research?.version
    if(!agreed || !version || working.current || research?.state!=='UNKNOWN' || research.acceptance)return
    if(acceptIntent.current?.versionId!==version.id || acceptIntent.current?.bodyHash!==version.bodyHash)acceptIntent.current={requestId:crypto.randomUUID(),versionId:version.id,bodyHash:version.bodyHash}
    const payload=acceptIntent.current
    void act(()=>publicStudyApi(credential).acceptResearchConsent(studyId,payload))
  }
  const withdraw=()=>{
    if(!research || working.current || research.state==='WITHDRAWAL_PENDING' || research.state==='EXCLUDED')return
    if(!window.confirm('确认申请退出研究？提交成功后立即从研究分析与研究导出中排除，研究者会审核处理。教育记录、已提交作答、完成状态和个人报告保留，身份码仍可使用。已下载文件无法收回。'))return
    if(withdrawIntent.current?.expectedRevision!==research.revision)withdrawIntent.current={requestId:crypto.randomUUID(),expectedRevision:research.revision}
    const payload=withdrawIntent.current
    void act(()=>publicStudyApi(credential).requestResearchWithdrawal(studyId,payload))
  }
  const accepted=!!research && !uncertain && research.state==='CONSENTED' && research.eligible && !!research.acceptance
  const excluded=research?.state==='WITHDRAWAL_PENDING' || research?.state==='EXCLUDED'
  const displayedVersion=research?.acceptedVersion ?? research?.version
  return <section className="space-y-3 rounded border p-4" aria-label="研究同意与退出">
    <h2 className="font-semibold">研究同意与退出</h2>
    <p>保存身份码只用于恢复和关联作答，不代表同意研究。未具版本化研究同意的作答不纳入研究分析与研究导出。</p>
    {pending && <p role="status">正在确认研究状态…</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {(!research || uncertain) ? <p>研究状态未知，尚不能确认已同意。</p>
      : research.state==='WITHDRAWAL_PENDING' ? <p role="status">退出申请待审核；已立即从研究分析与研究导出中排除。</p>
      : research.state==='EXCLUDED' ? <p role="status">已退出研究，研究分析与研究导出不再纳入。</p>
      : accepted ? <p role="status">{research.acceptedVersion ? `已明确同意第 ${research.acceptedVersion.version} 版研究说明。` : '已记录版本化研究同意，按接受时的正文保留。'}</p>
      : <p>{research.acceptance?'当前不具研究分析与研究导出资格；原同意记录保留。':'尚未取得有效的版本化研究同意，当前不纳入研究分析与研究导出。'}</p>}
    {research?.reason && <p className="text-sm">资格说明：{research.reason}</p>}
    {displayedVersion ? <>
      <h3 className="font-semibold">{research?.acceptedVersion?'已接受的研究同意正文':'研究同意正文'} · 第 {displayedVersion.version} 版</h3>
      <p className="text-sm">发布时间：{new Date(displayedVersion.publishedAt).toLocaleString()}</p>
      <p>固定研究目的：{displayedVersion.scope.purpose}</p><p>数据类别：{displayedVersion.scope.dataCategories.join('、')}</p>
      <p>本研究范围覆盖已有及后续波次，仅在本研究内关联。新增说明不会扩大已同意的研究目的或数据类别。</p>
      <div className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3">{displayedVersion.body}</div>
      {research?.acceptedVersion && research.version && research.version.id!==research.acceptedVersion.id && <details><summary>查看当前第 {research.version.version} 版补充说明（不改变原同意范围）</summary><div className="whitespace-pre-wrap break-words p-3">{research.version.body}</div></details>}
      {research?.state==='UNKNOWN' && !research.acceptance && !withdrawIntent.current && <>
        <label className="flex items-start gap-2"><input type="checkbox" checked={agreed} disabled={pending} onChange={e=>setAgreed(e.target.checked)}/><span>我已阅读第 {displayedVersion.version} 版研究同意正文，并自愿同意参与上述研究。</span></label>
        <button className="btn-primary" disabled={pending || !agreed} onClick={accept}>确认研究同意</button>
      </>}
    </> : research && <p>研究者尚未发布版本化研究同意正文。</p>}
    <p>研究退出不删除教育记录、已提交作答或完成状态，不影响个人报告和身份码的使用。已下载文件无法收回。</p>
    <div className="flex flex-wrap gap-3"><button disabled={pending} onClick={()=>setReload(value=>value+1)}>刷新研究状态</button>{research && !excluded && <button disabled={pending} onClick={withdraw}>申请退出研究</button>}</div>
  </section>
}

export default function AnonymousStudyPage() {
  const {studyId='',waveId='',token=''}=useParams(), navigate=useNavigate()
  const [info,setInfo]=useState<{studyId:string;studyTitle:string;title:string;accepting:boolean}|null>(null)
  const [home,setHome]=useState<StudyHome|null>(null), [input,setInput]=useState(''), [credential,setCredential]=useState('')
  const [newCode,setNewCode]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const epoch=useRef(0)
  const invalidateEpoch=useCallback(()=>{epoch.current++},[])
  useEffect(()=>{
    const current=++epoch.current
    setHome(null);setInfo(null);setCredential('');setInput('');setNewCode('');setError('');setConsent(false);setBusy(true)
    const load=async()=>{
      const entry=waveId?await publicStudyApi().info(waveId,token):null
      if(current!==epoch.current)return
      setInfo(entry)
      const sid=entry?.studyId || studyId, saved=sessionStorage.getItem(studyIdentityKey(sid)) || ''
      if(saved){const own=await publicStudyApi(saved).home(sid);if(current===epoch.current){setHome(own);setCredential(saved)}}
    }
    void load().catch(()=>{if(current===epoch.current){setHome(null);setError('暂时无法访问研究，请检查入口或重新输入身份码。')}}).finally(()=>{if(current===epoch.current)setBusy(false)})
    return invalidateEpoch
  },[studyId,waveId,token,invalidateEpoch])
  const sid=info?.studyId || studyId
  const act=async(work:()=>Promise<void>)=>{
    const current=epoch.current;setBusy(true);setError('')
    try{await work()}catch(e){if(current===epoch.current){setHome(null);setError(e instanceof Error?e.message:'研究操作失败')}}finally{if(current===epoch.current)setBusy(false)}
  }
  const login=()=>act(async()=>{
    setHome(null);const current=epoch.current, own=await publicStudyApi(input.trim()).home(sid)
    if(current!==epoch.current)return
    sessionStorage.setItem(studyIdentityKey(sid),input.trim());setCredential(input.trim());setInput('');setHome(own)
    navigate(`/public/studies/${sid}`,{replace:true})
  })
  const join=()=>act(async()=>{
    if(!consent)throw new Error('请先确认研究内关联说明')
    const current=epoch.current, joined=await publicStudyApi().join(waveId,token)
    if(current!==epoch.current)return
    sessionStorage.setItem(studyIdentityKey(joined.studyId),joined.credential);setCredential(joined.credential);setNewCode(joined.credential)
  })
  const open=(wave:StudyWave)=>act(async()=>{
    const current=epoch.current
    const own=await (wave.attemptId?publicStudyApi(credential).recover(sid,wave.id):publicStudyApi(credential).start(sid,wave.id))
    if(current!==epoch.current)return
    sessionStorage.setItem(`composite:recovery:attempt:${own.attemptId}`,own.recoveryToken)
    sessionStorage.setItem(`composite:study:return:${own.attemptId}`,`/public/studies/${sid}`)
    navigate(`/public/composite/attempts/${own.attemptId}${own.state==='COMPLETED'?'/report':''}`)
  })
  const clear=()=>{
    ++epoch.current;sessionStorage.removeItem(studyIdentityKey(sid))
    for(const wave of home?.waves ?? []) if(wave.attemptId){sessionStorage.removeItem(`composite:recovery:attempt:${wave.attemptId}`);sessionStorage.removeItem(`composite:study:return:${wave.attemptId}`)}
    setHome(null);setCredential('');setInput('');setNewCode('');setError('');setBusy(false)
  }
  const revoke=()=>act(async()=>{
    if(!window.confirm('如需退出研究，请先提交研究退出申请。停用后身份码和已有报告恢复凭证将失效，也无法再凭此身份码办理研究退出；必要时请联系原研究发布方。已提交数据会按研究约定保留。确定停用吗？'))return
    const current=epoch.current;await publicStudyApi(credential).revoke(sid);if(current===epoch.current)clear()
  })
  return <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">{home?.title || info?.studyTitle || '我的研究测评'}</h1>
    <p>无需实名，也不会建立师生关系。身份码仅用于本研究的本人作答、任务和历史个人报告。</p>
    {busy && <p role="status">正在确认访问…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
    {newCode ? <section className="space-y-3 rounded border p-4"><h2>请保存完整身份码</h2><p>这是登录凭证，仅显示在当前页面。丢失后无法凭姓名或短显示码找回。</p><code className="block break-all select-all">{newCode}</code><button className="btn-secondary" onClick={()=>void navigator.clipboard.writeText(newCode).catch(()=>setError('复制失败，请手动保存完整身份码'))}>复制身份码</button><button className="btn-primary ml-3" onClick={()=>navigate(`/public/studies/${sid}`,{replace:true})}>进入我的研究测评</button></section>
      : home ? <>
        <p>研究内显示码：{home.displayCode}（不能用于登录）</p>
        <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void act(async()=>{setHome(null);const current=epoch.current,own=await publicStudyApi(credential).home(sid);if(current===epoch.current)setHome(own)})}>刷新任务与历史</button><button disabled={busy} onClick={clear}>退出并清除本机凭证</button><button disabled={busy} onClick={()=>void revoke()}>停用身份码</button></div>
        <ResearchConsentPanel key={home.studyId} studyId={home.studyId} credential={credential}/>
        <h2 className="font-semibold">任务与历史个人报告</h2>
        {!home.waves.length && <p>暂无研究任务。</p>}
        {home.waves.map(wave=><article key={wave.id} className="space-y-2 rounded border p-4"><h3>第 {wave.ordinal} 波：{wave.title}</h3><p>{wave.state==='COMPLETED'?'已完成':wave.attemptId?'进行中':wave.accepting?'可参与':'暂未开放'}</p>{wave.completedAt && <p>{new Date(wave.completedAt).toLocaleString()}</p>}{(wave.attemptId || wave.accepting) && <button className="btn-primary" disabled={busy} onClick={()=>void open(wave)}>{wave.state==='COMPLETED'?'查看本次个人报告':wave.attemptId?'继续作答':'开始本波次测评'}</button>}</article>)}
        {home.limitations.map(text=><p key={text} className="text-sm text-gray-600">{text}</p>)}
      </> : <>
        {info && !info.accepting && <p>本波次已停止新参与，已有身份码仍可恢复研究历史。</p>}
        {info?.accepting && <section className="space-y-3 rounded border p-4"><h2>{info.title}</h2><p>单次访客模式：只保存本次作答凭证，不建立多次个人档案。未具版本化研究同意的访客作答不纳入研究分析与研究导出，也不会建立跨波次身份。</p><Link className="btn-secondary inline-block" to={`/public/composite/${token}`}>以单次访客开始</Link><p>研究内身份模式：保存身份码后，可换设备恢复，并参与本研究后续发布的波次。研究者能在本研究内关联这些作答。保存身份码不代表研究同意；进入后需独立阅读并明确同意研究正文。</p><label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我选择保存研究内身份，了解本研究多次作答可关联。</span></label><button className="btn-primary" disabled={busy || !consent} onClick={()=>void join()}>创建研究内身份码</button></section>}
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void login()}}><label className="grid gap-2">已有身份码，恢复研究任务<input autoComplete="off" type="password" value={input} onChange={e=>setInput(e.target.value)} className="input w-full"/></label><button className="btn-primary" disabled={busy || !input.trim()}>用身份码进入</button></form><p className="text-sm">已停用身份码不能恢复记录或办理研究退出，必要时请联系原研究发布方；短显示码不能替代完整身份码。</p>
      </>}
  </div>
}
