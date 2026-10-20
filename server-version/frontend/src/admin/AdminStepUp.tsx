import {useState} from 'react'
import {reauthenticateAdmin} from './securityKey'
export default function AdminStepUp(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  return <div><button type="button" className="btn-secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setMessage('')
    try{await reauthenticateAdmin();setMessage('安全密钥验证完成，五分钟内可执行敏感操作。')}
    catch(e){setMessage(e instanceof Error?e.message:'安全密钥验证未完成')}
    finally{setBusy(false)}
  }}>{busy?'正在验证…':'重新验证安全密钥'}</button><p role="status">{message}</p></div>
}
