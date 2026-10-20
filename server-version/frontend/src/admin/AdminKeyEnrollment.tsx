import {useState} from 'react'
import {Link} from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import {enrollSecurityKey} from './securityKey'
import api from '../api/client'
export default function AdminKeyEnrollment(){
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[ticket,setTicket]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  return <AuthShell tone="admin" title="登记管理安全密钥" description="使用受控后台提供的短期登记票据">
    <p>请准备支持用户验证的 USB 或 NFC 安全密钥。登记完成后仍需用密码和安全密钥登录。</p>
    <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setBusy(true);setMessage('')
      try{await api.get('/auth/csrf');await enrollSecurityKey(username,password,ticket);setPassword('');setTicket('');setMessage('安全密钥已登记，请前往管理员登录。')}
      catch(error){setMessage(error instanceof Error?error.message:'登记未完成')}
      finally{setBusy(false)}
    }}>
      <label>管理账号<input className="input" value={username} autoComplete="username" required onChange={e=>setUsername(e.target.value)}/></label>
      <label>当前密码<input className="input" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label>受控登记票据<input className="input" type="password" autoComplete="off" required value={ticket} onChange={e=>setTicket(e.target.value)}/></label>
      <button className="btn-primary" type="submit" disabled={busy}>{busy?'等待安全密钥…':'登记安全密钥'}</button>
    </form><p role="status">{message}</p><Link to="/admin/login">前往管理员登录</Link>
  </AuthShell>
}
