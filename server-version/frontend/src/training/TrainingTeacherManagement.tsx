import { useEffect, useRef, useState } from 'react'
import apiClient from '../api/client'
import type { User } from '../types'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import TemporaryPasswordHandoff, { type TemporaryPasswordHandoffValue } from '../components/staff-ui/TemporaryPasswordHandoff'

export type TeacherAction = 'EXTEND' | 'FREEZE' | 'UNFREEZE' | 'RESET_PASSWORD'
const titles:Record<TeacherAction,string>={EXTEND:'延长账号有效期',FREEZE:'冻结培训师账号',UNFREEZE:'解冻培训师账号',RESET_PASSWORD:'重置培训师密码'}
export default function TrainingTeacherManagement({selection,onClose,onChanged,onBusyChange}:{
  selection:{user:User;action:TeacherAction}|null;onClose:()=>void;onChanged:()=>Promise<void>;onBusyChange:(busy:boolean)=>void
}) {
  const [months,setMonths]=useState('12'),[customMonths,setCustomMonths]=useState('12')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [handoff,setHandoff]=useState<TemporaryPasswordHandoffValue|null>(null)
  const locked=useRef(false)
  useEffect(()=>{setMonths('12');setCustomMonths('12');setError('');setHandoff(null)},[selection])
  const close=()=>{if(!locked.current){setHandoff(null);onClose()}}
  const execute=async()=>{
    if(!selection||locked.current)return
    const {user,action}=selection
    const term=Number(months==='custom'?customMonths:months)
    if(action==='EXTEND'&&(!Number.isInteger(term)||term<1||term>120)){setError('延期月数需为 1–120 的整数。');return}
    if(!user.updatedAt){setError('账号版本信息缺失，请关闭弹窗并刷新列表后重试。');return}
    locked.current=true;setBusy(true);onBusyChange(true);setError('')
    try {
      const response=await apiClient.post(`/users/${user.id}/training-management`,{action,expectedUpdatedAt:user.updatedAt,...(action==='EXTEND'?{months:term}:{})})
      if(response.code!==0)throw new Error(response.message||'操作未完成')
      if(action==='RESET_PASSWORD') {
        setHandoff({studentName:user.nickname||user.username,username:response.data.username,temporaryPassword:response.data.temporaryPassword})
      }
      await onChanged()
      if(action!=='RESET_PASSWORD')onClose()
    }catch(cause){setError((cause as Error).message||'操作未完成，请刷新列表确认状态后重试。')}
    finally{locked.current=false;setBusy(false);onBusyChange(false)}
  }
  const user=selection?.user,action=selection?.action
  const expired=Boolean(user?.expiresAt&&new Date(user.expiresAt).getTime()<=Date.now())
  return <>
    <ManagementDialog open={Boolean(selection)&&!handoff} title={action?titles[action]:'培训师账号管理'} onClose={close} closeDisabled={busy} width="compact" className="training-accounts-dialog training-teacher-dialog"
      description={user?<span>{user.nickname||user.username} · {user.username}</span>:undefined}
      actions={<><button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={close}>取消</button><button type="button" className={`hui-button hui-button--${action==='FREEZE'||action==='RESET_PASSWORD'?'danger':'primary'}`} disabled={busy} onClick={()=>void execute()}>{busy?'处理中…':action==='EXTEND'?'确认延期':action==='FREEZE'?'确认冻结':action==='UNFREEZE'?'确认解冻':'确认重置密码'}</button></>}>
      <div className="training-teacher-command">
        {action==='EXTEND'&&<><p>当前到期：{user?.expiresAt?new Date(user.expiresAt).toLocaleString('zh-CN',{hour12:false}):'永久有效'}</p><label htmlFor="training-teacher-extension">延长时间</label><select id="training-teacher-extension" disabled={busy} value={months} onChange={event=>setMonths(event.target.value)}><option value="1">1 个月</option><option value="3">3 个月</option><option value="6">6 个月</option><option value="12">1 年</option><option value="custom">自定义月数</option></select>{months==='custom'&&<label className="training-teacher-custom">延期月数<input type="number" min="1" max="120" step="1" disabled={busy} value={customMonths} onChange={event=>setCustomMonths(event.target.value)}/></label>}<p>{expired?'账号已到期，将从当前时间开始续期。':'账号尚未到期，将从原到期日继续延长。'}延期不会解除冻结或代替注册审核。</p></>}
        {action==='FREEZE'&&<><p>冻结后立即停止该培训师的登录和系统访问，并使原有登录会话失效。</p><p>账号、课程、学员和历史数据保留。冻结期间有效期继续计算，之后可在此解冻。</p></>}
        {action==='UNFREEZE'&&<><p>解除临时冻结，保留原有效期和审核状态；培训师需要重新登录。</p>{expired&&<p className="training-accounts-expired">该账号已过期，解冻后还需延期才能登录。</p>}</>}
        {action==='RESET_PASSWORD'&&<><p>请先核实培训师身份。系统将生成随机临时密码，仅在下一步显示一次；原密码无法查看。</p><p>旧登录会话立即失效，首次登录必须修改密码。到期、冻结或待审核状态不会因此解除。</p></>}
        {error&&<p className="training-accounts-error" role="alert">{error}</p>}
      </div>
    </ManagementDialog>
    <TemporaryPasswordHandoff value={handoff} subject="培训师" training onClose={close}/>
  </>
}
