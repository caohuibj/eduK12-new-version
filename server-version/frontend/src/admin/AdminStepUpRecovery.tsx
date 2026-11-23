import {useEffect,useState} from 'react'
import AdminStepUp from './AdminStepUp'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import {useAuth} from '../contexts/AuthContext'
import {accountView} from './accountView'

/** Recover verification in place while the original editor retains its values.
 * The user must explicitly repeat the operation after verification. */
export default function AdminStepUpRecovery(){
 const {user}=useAuth()
 const [open,setOpen]=useState(false),[verified,setVerified]=useState(false)
 useEffect(()=>{
  const show=()=>{if(user&&(user.platformRole==='SYSTEM_ADMIN'||user.entryGrants?.length)&&accountView()==='MANAGEMENT'){setVerified(false);setOpen(true)}}
  window.addEventListener('admin:step-up-required',show)
  return()=>window.removeEventListener('admin:step-up-required',show)
 },[user])
 return <ManagementDialog open={open} onClose={()=>setOpen(false)} width="compact" title="重新验证管理员身份">
   {verified?<p role="status">身份验证已完成。请返回原页面，核对内容后重新执行原操作。</p>:<><p>敏感操作验证已过期。本次操作尚未提交，已填写内容会保留。</p><AdminStepUp onVerified={()=>setVerified(true)}/></>}
   <button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>{verified?'返回原操作':'暂不验证'}</button>
 </ManagementDialog>
}
