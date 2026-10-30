import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { publicStudyApi, studyIdentityKey, type AcceptResearchConsent, type RequestResearchWithdrawal, type ResearchParticipation, type StudyEntry, type StudyHome, type StudyWave } from '../../api/anonymousStudy'

import {PersonalParticipationLink} from '../../components/participation/PersonalParticipationLink'
import {ParticipationCodeSetup,ParticipationCodeSaved,ParticipationCodeRecovery,type MemorableEnrollment} from '../../components/participation/ParticipationCode'
import {trainingStudyLink} from '../../components/participation/training-participation-link'
import {TrainingPersonalChanges} from '../../modules/composite/TrainingPersonalChanges'

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
  const {studyId='',waveId='',token=''}=useParams(), navigate=useNavigate(),location=useLocation()
  const [info,setInfo]=useState<StudyEntry|null>(null)
  const [home,setHome]=useState<StudyHome|null>(null), [input,setInput]=useState(''), [credential,setCredential]=useState('')
  const [reload,setReload]=useState(0)
  const [newCode,setNewCode]=useState(''),[fullCode,setFullCode]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const epoch=useRef(0)
  const invalidateEpoch=useCallback(()=>{epoch.current++},[])
  useEffect(()=>{
    const current=++epoch.current
    setHome(null);setInfo(null);setCredential('');setInput('');setNewCode('');setFullCode('');setError('');setConsent(false);setBusy(true)
    const load=async()=>{
      const entry=waveId?await publicStudyApi().info(waveId,token):{...await publicStudyApi().participationInfo(studyId),id:'',title:'',accepting:false}
      if(current!==epoch.current)return
      setInfo(entry)
      const sid=entry?.studyId || studyId, saved=trainingStudyLink.read(location.hash)?.key || sessionStorage.getItem(studyIdentityKey(sid)) || ''
      if(saved){setCredential(saved);const own=await publicStudyApi(saved).home(sid);if(current===epoch.current){setHome(own);setCredential(saved);sessionStorage.setItem(studyIdentityKey(sid),saved);if(location.hash)navigate(location.pathname,{replace:true})}}
    }
    void load().catch(()=>{if(current===epoch.current){setHome(null);setError('暂时无法访问研究，请检查入口或重新输入身份码。')}}).finally(()=>{if(current===epoch.current)setBusy(false)})
    return invalidateEpoch
  },[studyId,waveId,token,invalidateEpoch,location.hash,location.pathname,navigate,reload])
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
  const join=(memorable?:MemorableEnrollment)=>act(async()=>{
    if(!consent)throw new Error('请先确认研究内关联说明')
    const current=epoch.current, joined=await publicStudyApi().join(waveId,token,memorable??(info?.mode==='SELF_CODE'?{generatedCode:true}:undefined))
    if(current!==epoch.current)return
    sessionStorage.setItem(studyIdentityKey(joined.studyId),joined.credential);setCredential(joined.credential);setNewCode(joined.credential);setFullCode(joined.fullCode??'')
  })
  const recoverCode=(code:string,resetSuffix?:string)=>act(async()=>{
    const current=epoch.current
    const joined=await (resetSuffix===undefined?publicStudyApi().recoverCode(sid,code):publicStudyApi().resetCode(sid,code,resetSuffix))
    if(current!==epoch.current)return
    const own=await publicStudyApi(joined.credential).home(sid)
    if(current!==epoch.current)return
    sessionStorage.setItem(studyIdentityKey(sid),joined.credential);setCredential(joined.credential);setHome(own)
    navigate(`/public/studies/${sid}`,{replace:true})
  })
  const open=(wave:StudyWave)=>act(async()=>{
    const current=epoch.current
    const own=await (wave.attemptId?publicStudyApi(credential).recover(sid,wave.id):publicStudyApi(credential).start(sid,wave.id))
    if(current!==epoch.current)return
    sessionStorage.setItem(`composite:recovery:attempt:${own.attemptId}`,own.recoveryToken)
    sessionStorage.setItem(`composite:study:return:${own.attemptId}`,`/public/studies/${sid}`)
    navigate(`/public/composite/attempts/${own.attemptId}${own.state==='COMPLETED'?'/report':''}`)
  })
  const refreshHome=()=>act(async()=>{
    setHome(null);const current=epoch.current,own=await publicStudyApi(credential).home(sid)
    if(current===epoch.current)setHome(own)
  })
  const clear=()=>{
    ++epoch.current;sessionStorage.removeItem(studyIdentityKey(sid))
    for(const wave of home?.waves ?? []) if(wave.attemptId){sessionStorage.removeItem(`composite:recovery:attempt:${wave.attemptId}`);sessionStorage.removeItem(`composite:study:return:${wave.attemptId}`)}
    // A failed home read hides the wave list, but the same-study local grants
    // still need explicit cleanup. Other studies and standalone attempts stay.
    for(const key of Object.keys(sessionStorage))if(key.startsWith('composite:study:return:')&&sessionStorage.getItem(key)===`/public/studies/${sid}`){
      const attemptId=key.slice('composite:study:return:'.length)
      sessionStorage.removeItem(`composite:recovery:attempt:${attemptId}`);sessionStorage.removeItem(key)
    }
    setHome(null);setCredential('');setInput('');setNewCode('');setFullCode('');setError('');setBusy(false)
    if(trainingStudyLink.read(location.hash))navigate(location.pathname+location.search,{replace:true})
  }
  const revoke=()=>act(async()=>{
    if(!window.confirm('如需退出研究，请先提交研究退出申请。停用后身份码和已有报告恢复凭证将失效，也无法再凭此身份码办理研究退出；必要时请联系原研究发布方。已提交数据会按研究约定保留。确定停用吗？'))return
    const current=epoch.current;await publicStudyApi(credential).revoke(sid);if(current===epoch.current)clear()
  })
  const step=newCode?1:home?2:0
  return <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8" aria-busy={busy}>
    <header className="space-y-3 rounded-2xl border border-action/20 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-action">培训匿名参与 · 无需登录</p>
      <h1 className="text-2xl font-semibold">{home?.title || info?.studyTitle || '我的研究测评'}</h1>
      <p className="text-sm text-gray-600">此入口无需学员账号登录，也不会建立师生关系。参与凭据仅用于本研究的本人作答、任务和历史个人报告。</p>
      <nav aria-label="匿名参与步骤"><ol className="flex flex-wrap gap-3 text-sm">
        {['进入或领取','保存参与凭据','任务与历史'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={step===index?'rounded-full bg-action px-3 py-1 text-white':'rounded-full bg-gray-100 px-3 py-1 text-gray-600'}>{index+1}. {label}</li>)}
      </ol></nav>
    </header>
    {busy && <p role="status" className="rounded-xl border p-4 text-sm">正在确认访问…请稍候，不必重复领取或提交。</p>}
    {error && <section role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p>{error}</p><p className="text-sm">未显示任务不代表原作答已丢失。请保留原参与凭据，不要另领身份来找回历史。</p>{credential?<button className="btn-secondary" disabled={busy} onClick={()=>void refreshHome()}>重新读取我的任务</button>:!info&&<button className="btn-secondary" disabled={busy} onClick={()=>setReload(value=>value+1)}>重新载入入口</button>}{credential&&<button className="btn-secondary" disabled={busy} onClick={clear}>清除本机凭据并重新输入</button>}</section>}
    {newCode ? <section aria-label="保存本人的参与凭据" className="space-y-4">
      <h2 className="text-lg font-semibold">先保存，下次才能继续</h2>
      <p className="text-sm text-gray-600">仅本人保管；这不是学员账号，也不代表已经提交作答或同意研究。</p>
      {fullCode?<ParticipationCodeSaved fullCode={fullCode} generated={info?.mode==='SELF_CODE'} busy={busy} onSaved={()=>{setNewCode('');navigate(`/public/studies/${sid}`,{replace:true})}}/>
      :<><PersonalParticipationLink url={trainingStudyLink.link(window.location.origin,sid,{key:newCode})} firstTime busy={busy} fileLabel="培训" continueLabel="进入我的研究测评" scopeNotice="仅恢复本培训研究内的任务与个人报告，不建立登录账号或师生关系。" onSaved={()=>{setNewCode('');navigate(`/public/studies/${sid}`,{replace:true})}}/>
      <details><summary>查看完整恢复凭据</summary><code className="break-all">{newCode}</code></details></>}
    </section>
      : home ? <>
        <section className="space-y-3 rounded-xl border p-4" aria-label="本人的参与记录">
          <p>研究内显示码：{home.displayCode}（不能用于登录）</p>
          <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={busy} onClick={()=>void refreshHome()}>刷新任务与历史</button><button className="btn-secondary" disabled={busy} onClick={clear}>退出并清除本机凭证</button><button className="btn-secondary" disabled={busy} onClick={()=>void revoke()}>停用身份码</button></div>
        </section>
        <section aria-label="任务与历史个人报告" className="space-y-3">
          <h2 className="text-lg font-semibold">任务与历史个人报告</h2>
          <p className="text-sm text-gray-600">继续原作答，不会新建另一份答卷。已完成表示作答完成，报告仍按本测评的生成状态与开放权限显示。</p>
          {!home.waves.length && <p>暂无研究任务。</p>}
          {home.waves.map(wave=><article key={wave.id} className="space-y-3 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">第 {wave.ordinal} 波：{wave.title}</h3><p className="rounded-full bg-gray-100 px-3 py-1 text-sm">{wave.state==='COMPLETED'?'已完成':wave.attemptId?'进行中':wave.accepting?'可参与':'暂未开放'}</p></div>{wave.completedAt && <p className="text-sm text-gray-600">完成时间：{new Date(wave.completedAt).toLocaleString()}</p>}{(wave.attemptId || wave.accepting) && <button className="btn-primary" disabled={busy} onClick={()=>void open(wave)}>{wave.state==='COMPLETED'?'查看本次个人报告':wave.attemptId?'继续作答':'开始本波次测评'}</button>}{wave.state==='COMPLETED'&&wave.attemptId&&<TrainingPersonalChanges attemptId={wave.attemptId} study={{studyId:home.studyId,credential}}/>}</article>)}
          {home.limitations.map(text=><p key={text} className="text-sm text-gray-600">{text}</p>)}
        </section>
        <ResearchConsentPanel key={home.studyId} studyId={home.studyId} credential={credential}/>
      </> : info && !credential ? <>
        <section aria-label="恢复已有参与记录" className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">已经参加过？继续原来的记录</h2>
          <p className="text-sm text-gray-600">使用原参与链接或完整编码。短显示码不能替代秘密凭据，也不能用于恢复其他培训或问卷。</p>
          {info.mode==='MEMORABLE_CODE'||info.mode==='SELF_CODE'?<ParticipationCodeRecovery busy={busy} generated={info.mode==='SELF_CODE'} onEnter={code=>void recoverCode(code)} onReset={(code,suffix)=>void recoverCode(code,suffix)}/>:<><form className="space-y-3" onSubmit={e=>{e.preventDefault();void login()}}><label className="grid gap-2">已有身份码，恢复研究任务<input autoComplete="off" type="password" value={input} onChange={e=>setInput(e.target.value)} className="input w-full"/></label><button className="btn-primary" disabled={busy || !input.trim()}>用身份码进入</button></form><p className="text-sm">已停用身份码不能恢复记录或办理研究退出，必要时请联系原研究发布方；短显示码不能替代完整身份码。</p></>}
        </section>
        {!info.accepting && <p className="rounded-xl bg-gray-50 p-4 text-sm">本波次已停止新参与，已有身份码仍可恢复研究历史。</p>}
        {info.accepting && <section className="space-y-4 rounded-xl border p-5" aria-label="首次领取参与身份">
          <h2 className="text-lg font-semibold">{info.title}</h2><h3 className="font-semibold">首次参加，领取本研究的参与凭据</h3>
          <p className="text-sm">研究内身份模式：保存身份码后，可换设备恢复，并参与本研究后续发布的波次。研究者能在本研究内关联这些作答。保存身份码不代表研究同意；进入后需独立阅读并明确同意研究正文。</p>
          <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3"><input type="checkbox" disabled={busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我选择保存研究内身份，了解本研究多次作答可关联。</span></label>
          {info.mode==='MEMORABLE_CODE'?<ParticipationCodeSetup label={info.label||'分配的短编号'} instructions={info.instructions||''} busy={busy||!consent} onSubmit={value=>void join(value)}/>:<button className="btn-primary" disabled={busy || !consent} onClick={()=>void join()}>{info.mode==='SELF_CODE'?'领取随机恢复编码':'创建研究内身份码'}</button>}
        </section>}
        {info.accepting && <section className="space-y-3 rounded-xl border border-dashed p-5" aria-label="单次访客参与">
          <h2 className="font-semibold">只参加这一次？</h2><p className="text-sm">单次访客模式：只保存本次作答凭证，不建立多次个人档案。未具版本化研究同意的访客作答不纳入研究分析与研究导出，也不会建立跨波次身份。</p>
          <Link className="btn-secondary inline-block" to={`/public/composite/${token}`}>以单次访客开始</Link>
        </section>}
      </> : null}
  </div>
}
