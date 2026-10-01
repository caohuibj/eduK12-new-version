import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { publicStudyApi, studyIdentityKey, type StudyHome, type StudyWave } from '../../api/anonymousStudy'

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
    if(!window.confirm('停用后身份码和已有报告恢复凭证将失效。已提交研究数据会按研究约定保留。确定停用吗？'))return
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
        <h2 className="font-semibold">任务与历史个人报告</h2>
        {!home.waves.length && <p>暂无研究任务。</p>}
        {home.waves.map(wave=><article key={wave.id} className="space-y-2 rounded border p-4"><h3>第 {wave.ordinal} 波：{wave.title}</h3><p>{wave.state==='COMPLETED'?'已完成':wave.attemptId?'进行中':wave.accepting?'可参与':'暂未开放'}</p>{wave.completedAt && <p>{new Date(wave.completedAt).toLocaleString()}</p>}{(wave.attemptId || wave.accepting) && <button className="btn-primary" disabled={busy} onClick={()=>void open(wave)}>{wave.state==='COMPLETED'?'查看本次个人报告':wave.attemptId?'继续作答':'开始本波次测评'}</button>}</article>)}
        {home.limitations.map(text=><p key={text} className="text-sm text-gray-600">{text}</p>)}
      </> : <>
        {info && !info.accepting && <p>本波次已停止新参与，已有身份码仍可恢复研究历史。</p>}
        {info?.accepting && <section className="space-y-3 rounded border p-4"><h2>{info.title}</h2><p>单次访客模式：只保存本次作答凭证，不建立多次个人档案。</p><Link className="btn-secondary inline-block" to={`/public/composite/${token}`}>以单次访客开始</Link><p>研究内身份模式：保存身份码后，可换设备恢复，并参与本研究后续发布的波次。研究者能在本研究内关联这些作答。</p><label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我选择保存研究内身份，了解本研究多次作答可关联。</span></label><button className="btn-primary" disabled={busy || !consent} onClick={()=>void join()}>创建研究内身份码</button></section>}
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void login()}}><label className="grid gap-2">已有身份码，恢复研究任务<input autoComplete="off" type="password" value={input} onChange={e=>setInput(e.target.value)} className="input w-full"/></label><button className="btn-primary" disabled={busy || !input.trim()}>用身份码进入</button></form>
      </>}
  </div>
}
