import { useEffect,useRef,useState } from 'react'

export function isSurveyDesktop():boolean{
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    &&!(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
}
export async function verifySurveyCognitiveStorage():Promise<void>{
  if(!window.indexedDB)throw new Error('浏览器未提供本机暂存能力，不能开始认知任务。')
  const name='survey-cognitive-admission-'+crypto.randomUUID()
  await new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open(name,1)
    request.onupgradeneeded=()=>request.result.createObjectStore('check')
    request.onerror=()=>reject(new Error('本机暂存不可用，请检查浏览器存储权限。'))
    request.onsuccess=()=>{
      const db=request.result
      const tx=db.transaction('check','readwrite');tx.objectStore('check').put('ready','probe')
      tx.oncomplete=()=>{db.close();indexedDB.deleteDatabase(name);resolve()}
      tx.onerror=()=>{db.close();indexedDB.deleteDatabase(name);reject(new Error('本机暂存写入失败，不能保证任务恢复。'))}
    }
  })
}
export function SurveyCognitiveDeviceGate({onReady,preview=false}:{onReady:()=>void;preview?:boolean}){
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const [keyboard,setKeyboard]=useState(false),[confirmed,setConfirmed]=useState(false)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const desktop=isSurveyDesktop()
  const ready=async()=>{
    if(!mounted.current||!desktop||!keyboard||!confirmed)return
    setBusy(true);setError('')
    try{if(!preview)await verifySurveyCognitiveStorage();if(mounted.current)onReady()}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'本机暂存检查失败')}
    finally{if(mounted.current)setBusy(false)}
  }
  return <section className="border rounded-xl bg-white p-4 space-y-3" aria-label="认知任务设备检查">
    <h4 className="font-semibold">请使用电脑和实体键盘</h4>
    <p className="text-sm">Go/No-Go 正式任务仅接受键盘反应。浏览器只能检查设备信号和按键，不能认证物理设备或实际显示延迟。</p>
    {!desktop&&<p role="alert">当前设备不满足本任务的电脑要求。请保留研究私密凭证并使用合适的电脑恢复；不会跳过任务或计为完成。单次匿名作答只能在原标签页恢复。</p>}
    <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 我正在使用桌面／笔记本电脑和实体键盘</label>
    <label className="block text-sm">在下框按 Enter 检查键盘
      <input className="input block w-full" aria-label="键盘检查" readOnly value={keyboard?'已检测到 Enter 按键':''}
        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setKeyboard(true)}}}/></label>
    {!preview&&<p className="text-xs">开始后，前置工具答案将锁定。未封存的中断不逐试次续测，最多允许整个单元重做一次。任务试次只暂存本机，结束后一次提交。</p>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" className="btn-primary" disabled={busy||!desktop||!keyboard||!confirmed} onClick={()=>void ready()}>{preview?'开始真实任务预览':'检查暂存并进入认知任务'}</button>
  </section>
}
