import { useState } from 'react'
import { LogOut, ShieldCheck, UserRound, X } from 'lucide-react'
import ModalSurface from '../components/shared-ui/ModalSurface'
import { ProductPasswordChange } from '../components/account/ProductPasswordChange'
import './survey-account.css'

export function SurveyResearcherAccount({username,busy,writeBusy,error,onLogout,onChangePassword}:{
  username:string;busy:boolean;writeBusy:boolean;error:string;onLogout:()=>void
  onChangePassword:(current:string,next:string,code?:string)=>void
}) {
  const [open,setOpen]=useState(false)
  const close=()=>{if(!busy)setOpen(false)}
  return <>
    <div className="survey-account-actions">
      <button type="button" className="survey-account-trigger" aria-label={`${username}，个人账号设置`}
        aria-haspopup="dialog" onClick={()=>setOpen(true)}>
        <UserRound size={19} aria-hidden="true"/><span>{username}</span>
      </button>
      <button type="button" className="survey-account-logout" aria-label="退出" disabled={writeBusy} onClick={onLogout}>
        <LogOut size={18} aria-hidden="true"/><span>退出</span>
      </button>
    </div>
    <ModalSurface open={open} onClose={close} className="survey-account-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="survey-account-title" tabIndex={-1} className="survey-account-panel">
        <header><div><p className="survey-workspace-eyebrow">RESEARCH · 个人账号</p><h2 id="survey-account-title">个人信息与安全</h2></div>
          <button type="button" className="survey-account-close" aria-label="关闭个人账号设置" disabled={busy} onClick={close}><X size={20} aria-hidden="true"/></button>
        </header>
        <dl className="survey-account-identity"><div><dt>研究者登录名</dt><dd>{username}</dd></div><div><dt>账号身份</dt><dd>研究者</dd></div></dl>
        <div className="survey-account-password"><h3><ShieldCheck size={19} aria-hidden="true"/>修改密码</h3>
          <p>使用当前密码与手机验证器动态码确认身份。</p>
          {error&&<p role="alert" className="survey-account-error">{error}</p>}
          <ProductPasswordChange product="survey" busy={busy} onChangePassword={onChangePassword}/>
        </div>
      </section>
    </ModalSurface>
  </>
}
