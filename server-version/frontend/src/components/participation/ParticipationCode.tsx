import {useId,useState,type FormEvent} from 'react'
export type MemorableEnrollment={prefix:string;suffix:string}
export function ParticipationCodeSetup({label,instructions,busy,onSubmit}:{label:string;instructions:string;busy:boolean;onSubmit:(value:MemorableEnrollment)=>void}){
 const [prefix,setPrefix]=useState(''),[suffix,setSuffix]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState('')
 const submit=(e:FormEvent)=>{e.preventDefault();const normalized=suffix.normalize('NFKC').trim().toUpperCase();if(!/^[A-Z0-9]{4,12}$/.test(normalized)){setError('后缀请使用4–12位字母或数字。');return}if(normalized!==again.normalize('NFKC').trim().toUpperCase()){setError('两次后缀不一致，请重新核对。');return}setError('');onSubmit({prefix:prefix.normalize('NFKC').trim().toUpperCase(),suffix:normalized})}
 return <form className="survey-memorable-form" onSubmit={submit} aria-label="设置研究编码"><h3>设置一个你记得住的研究编码</h3>
  <p>{instructions||'请输入研究者分配给你的编号，再设置一个私人后缀。'}</p>
  <fieldset disabled={busy}><label>{label}<input required className="input" autoComplete="off" value={prefix} maxLength={20} onChange={e=>setPrefix(e.target.value)}/></label>
   <label>自己设置的后缀<input required className="input" type="password" autoComplete="new-password" value={suffix} maxLength={12} onChange={e=>setSuffix(e.target.value)}/></label>
   <label>再次确认后缀<input required className="input" type="password" autoComplete="new-password" value={again} maxLength={12} onChange={e=>setAgain(e.target.value)}/></label>
   <small>4–12位字母或数字，不区分大小写。后缀只由你保管，请勿使用账号密码。</small>
   {error&&<p role="alert">{error}</p>}<button className="btn-primary" type="submit">确认研究编码</button>
  </fieldset></form>
}
export function ParticipationCodeSaved({fullCode,generated=false,busy=false,onSaved}:{fullCode:string;generated?:boolean;busy?:boolean;onSaved:()=>void}){
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false)
 const copy=async()=>{try{await navigator.clipboard.writeText(fullCode);setCopied(true);setCopyError(false)}catch{setCopyError(true)}}
 return <section className="survey-personal-link survey-participant-panel" aria-label="请记住研究编码"><h3>{generated?'保存研究编码，下次继续参加':'记住这一个编码，下次继续参加'}</h3>
  <code className="survey-memorable-display">{fullCode}</code><p>以后在本研究的参与页面输入完整编码即可。{generated?'请复制或截图保存。丢失后无法找回，也无法重新生成原答卷的编码。仅供本人使用，请勿转发。':'请只由本人使用，私人后缀不要告诉他人。'}</p>
  {generated&&<><button className="btn-secondary" type="button" disabled={busy} onClick={()=>void copy()}>{copied?'已复制编码':'复制研究编码'}</button>
   {copyError&&<p role="status">暂时无法复制，请手动复制上方编码或截图保存。</p>}</>}
  <button className="btn-primary survey-participant-action" type="button" disabled={busy} onClick={onSaved}>我已保存，进入答题</button></section>
}
export function ParticipationCodeRecovery({busy,generated=false,entryTitle,onEnter,onReset}:{busy:boolean;generated?:boolean;entryTitle?:string;onEnter:(fullCode:string)=>void;onReset:(resetCode:string,suffix:string)=>void}){
 const helpId=useId()
 const [fullCode,setFullCode]=useState(''),[resetting,setResetting]=useState(false),[resetCode,setResetCode]=useState(''),[suffix,setSuffix]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState('')
 const reset=(e:FormEvent)=>{e.preventDefault();if(suffix.trim().toUpperCase()!==again.trim().toUpperCase()){setError('两次后缀不一致，请核对。');return}setError('');onReset(resetCode,suffix)}
 return <section className={'survey-participant-panel survey-code-recovery'+(entryTitle?' survey-code-recovery--entry':'')} aria-label="使用研究编码继续参加">{entryTitle?<><span className="survey-code-entry-eyebrow">匿名参与 · 无需登录</span><h2>{entryTitle}</h2><h3>使用原编码继续参加</h3></>:<h3>继续参加</h3>}
  <form className="survey-memorable-form" onSubmit={e=>{e.preventDefault();onEnter(fullCode)}}><label>完整研究编码<input required className="input" type="password" autoComplete="off" aria-describedby={helpId} placeholder={generated?'输入你保存的随机研究编码':'例如 001-SKY7'} maxLength={64} value={fullCode} onChange={e=>setFullCode(e.target.value)}/></label>
   <button type="submit" className="btn-primary" disabled={busy||!fullCode.trim()}>继续参加</button></form>
  <p id={helpId} className="survey-code-muted">{generated?'请使用首次领取的编码，关联前后的回答。丢失后无法找回。':'忘记后缀？请联系研究者，说明分配给你的短编号。'}</p>
  {entryTitle&&<p className="survey-code-invitation-note"><strong>首次参加？</strong>请打开研究者发来的完整邀请链接，阅读并同意后领取编码。</p>}
  {!generated&&<button className="survey-code-text-button" type="button" aria-expanded={resetting} onClick={()=>setResetting(v=>!v)}>研究者已为我重置编码</button>}
  {!generated&&resetting&&<form className="survey-memorable-form" onSubmit={reset} aria-label="重置研究编码"><label>一次性重置码<input required className="input" autoComplete="off" value={resetCode} maxLength={64} onChange={e=>setResetCode(e.target.value)}/></label>
   <label>新的私人后缀<input required className="input" type="password" autoComplete="new-password" value={suffix} maxLength={12} onChange={e=>setSuffix(e.target.value)}/></label>
   <label>确认新的后缀<input required className="input" type="password" autoComplete="new-password" value={again} maxLength={12} onChange={e=>setAgain(e.target.value)}/></label>
   <small>4–12位字母或数字，不区分大小写，与原后缀不同。</small>{error&&<p role="alert">{error}</p>}
   <button className="btn-primary" type="submit" disabled={busy}>设置新后缀</button></form>}
 </section>
}
