import {useState} from 'react'
import {reauthenticateAdmin} from './securityKey'
export default function AdminStepUp({onVerified}:{onVerified?:(requestedAt:number)=>void}={}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[code,setCode]=useState('')
  const [method,setMethod]=useState<'TOTP'|'SECURITY_KEY'>('TOTP')
  return <form className="space-y-3" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setMessage('')
    const requestedAt=Date.now()
    try{await reauthenticateAdmin(code,method);setMessage(onVerified?'':'管理员双因素验证完成，五分钟内可执行敏感操作。');onVerified?.(requestedAt)}
    catch(error){setMessage(error instanceof Error?error.message:'双因素验证未完成')}
    finally{setCode('');setBusy(false)}
  }}>
    <label>敏感操作验证方式<select className="input" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as typeof method);setCode('');setMessage('')}}>
      <option value="TOTP">Authenticator 动态码</option><option value="SECURITY_KEY">已绑定的硬件安全密钥</option>
    </select></label>
    {method==='TOTP'&&<label>Authenticator 六位动态码<input className="input" value={code} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
      autoComplete="one-time-code" disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
    <button type="submit" className="btn-secondary" disabled={busy}>{busy?'正在验证…':'重新验证管理员身份'}</button>
    {message&&<p role="status">{message}</p>}
  </form>
}
