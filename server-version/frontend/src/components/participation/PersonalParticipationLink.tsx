import {useRef,useState} from 'react'
import {QRCodeCanvas} from 'qrcode.react'

export function PersonalParticipationLink({url,firstTime,busy=false,onSaved,fileLabel='问卷',continueLabel='我已保存，进入答题',scopeNotice}:{url:string;firstTime:boolean;busy?:boolean;onSaved:()=>void;fileLabel?:string;continueLabel?:string;scopeNotice?:string}){
  const [message,setMessage]=useState('')
  const [showQr,setShowQr]=useState(firstTime)
  const qrCanvas=useRef<HTMLCanvasElement>(null)
  const copy=async()=>{
    try{await navigator.clipboard.writeText(url);setMessage('链接已复制，请粘贴到你自己的备忘录中保存。')}
    catch{setMessage('未能自动复制，请展开下方链接，手动复制保存。')}
  }
  const download=()=>{
    const blob=new Blob(['你的专属参与链接\n\n'+url+'\n\n请妥善保存。后续打开此链接或扫描配套二维码即可继续参加。两者都丢失后无法找回，也无法重新生成原来的参与入口。仅供本人使用，请勿转发。\n'],{type:'text/plain;charset=utf-8'})
    const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a')
    anchor.href=objectUrl;anchor.download=`我的${fileLabel}参与链接.txt`;anchor.click()
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)
    setMessage('已发起保存，请确认文件已下载到你的设备。')
  }
  const downloadQr=()=>{
    try{
      if(!qrCanvas.current)throw new Error('QR not ready')
      const anchor=document.createElement('a')
      anchor.href=qrCanvas.current.toDataURL('image/png')
      anchor.download=`我的${fileLabel}参与二维码.png`;anchor.click()
      setMessage('已发起保存，请确认二维码图片已下载。')
    }catch{setMessage('未能自动保存图片，可截屏保存下方二维码。')}
  }
  return <section className="survey-personal-link survey-participant-panel" aria-label="专属参与链接">
    <span className="survey-personal-link-tag">无需账号 · 分次参与</span>
    <h3>{firstTime?'保存专属链接或二维码':'你的专属参与链接'}</h3>
    <p>下次打开链接或扫描二维码，即可继续参加。</p>{scopeNotice&&<p>{scopeNotice}</p>}
    {firstTime&&<p className="survey-identity-save-notice">请至少保存一种。链接和二维码都丢失后，无法找回，也无法重新生成原来的参与入口。</p>}
    <p className="survey-personal-link-private">仅供本人使用，请勿转发。</p>
    <div className="survey-personal-save-body">
      <div className="survey-personal-save-tools">
    <div className="survey-personal-link-actions">
      <button type="button" disabled={busy} className="btn-primary survey-participant-action" onClick={()=>void copy()}>复制专属链接</button>
      <button type="button" disabled={busy} className="btn-secondary survey-participant-action" onClick={download}>保存链接文件</button>
      <button type="button" disabled={busy} className="btn-secondary survey-participant-action" aria-expanded={showQr}
        aria-controls="survey-personal-qr" onClick={()=>setShowQr(value=>!value)}>{showQr?'收起二维码':'显示专属二维码'}</button>
    </div>
    {message&&<p role="status" className="survey-identity-save-feedback">{message}</p>}
    <details><summary>查看并手动复制链接</summary>
      <label className="sr-only" htmlFor="survey-personal-url">专属链接地址</label>
      <textarea id="survey-personal-url" readOnly value={url} rows={4} spellCheck={false}
        onFocus={event=>event.currentTarget.select()}/>
    </details>
      </div>
    {showQr&&<div className="survey-personal-qr" id="survey-personal-qr">
      <QRCodeCanvas ref={qrCanvas} value={url} size={208} level="M" marginSize={4}
        role="img" aria-label="专属参与二维码"/>
      <p>与专属链接通用，保存一种即可。</p>
      <button type="button" disabled={busy} className="btn-secondary survey-participant-action" onClick={downloadQr}>保存二维码图片</button>
    </div>}
    </div>
    {firstTime&&<button type="button" disabled={busy} className="btn-primary survey-participant-action survey-personal-link-confirm"
      onClick={onSaved}>{continueLabel}</button>}
  </section>
}
