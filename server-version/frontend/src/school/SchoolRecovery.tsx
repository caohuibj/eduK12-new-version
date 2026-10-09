import { useState, type FormEvent } from 'react'

export type SchoolApi = <T>(path: string, method?: string, payload?: unknown) => Promise<T>

type RecoveryReceipt = { username: string; recoveryCode: string; expiresAt: string }
type Incident = { id: string; reason: string; createdAt: string }

const TextField = ({label,value,setValue,type='text'}: {
  label:string;value:string;setValue:(value:string)=>void;type?:string
}) => <label className="hs-field"><span>{label}</span>
  <input required value={value} type={type} autoComplete="off"
    onChange={event=>setValue(event.target.value)} />
</label>

export function SchoolStudentRecovery({api,onComplete}: {api:SchoolApi;onComplete:()=>void}) {
  const [recoveryCode,setRecoveryCode]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [newLogin,setNewLogin]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function redeem(event:FormEvent) {
    event.preventDefault()
    setBusy(true);setError('')
    try{
      await api('/credentials/redeem','POST',{
        recoveryCode,newPassword,
        ...(newLogin.trim()?{newLogin:newLogin.trim()}:{}),
      })
      setRecoveryCode('');setNewPassword('');setNewLogin('')
      onComplete()
    }catch(cause){setError(cause instanceof Error?cause.message:'恢复请求未能完成')}
    finally{setBusy(false)}
  }
  return <section className="hs-panel hs-narrow">
    <h1>校园账号找回</h1>
    <p>请先由学校授权人员通过独立渠道核验本人身份，取得短时有效的一次性恢复码。
      培训版账户与校园版互不通用。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    <form onSubmit={event=>void redeem(event)}>
      <TextField label="一次性恢复码" value={recoveryCode} setValue={setRecoveryCode}/>
      <TextField label="新密码" type="password" value={newPassword} setValue={setNewPassword}/>
      <label className="hs-field"><span>新用户名（如无需修改可留空）</span>
        <input autoComplete="off" value={newLogin} onChange={event=>setNewLogin(event.target.value)} />
      </label>
      <button className="hs-primary" disabled={busy||!recoveryCode||!newPassword}>核验并恢复账号</button>
    </form>
  </section>
}

export function SchoolRecoveryOfficer({api,classPath}: {api:SchoolApi;classPath:string}) {
  const [number,setNumber]=useState('')
  const [verified,setVerified]=useState(false)
  const [reason,setReason]=useState<'FORGOT_PASSWORD'|'FORGOT_LOGIN'|'INCIDENT_CORRECTION'>('FORGOT_PASSWORD')
  const [receipt,setReceipt]=useState<RecoveryReceipt|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [incidentReason,setIncidentReason]=useState<'ELIGIBILITY_DISPUTE'|'SUSPECTED_REGISTRATION_TAKEOVER'|'OTHER_REGISTRATION_ERROR'>('ELIGIBILITY_DISPUTE')
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [incidentId,setIncidentId]=useState('')
  const [resolution,setResolution]=useState<'VERIFIED_CORRECT'|'STUDENT_QUARANTINED'|'ROSTER_CORRECTED'>('VERIFIED_CORRECT')
  const [quarantineNo,setQuarantineNo]=useState('')

  async function execute(action:()=>Promise<void>){
    setBusy(true);setError('');setNotice('')
    try{await action()}catch(cause){setError(cause instanceof Error?cause.message:'操作未能完成')}
    finally{setBusy(false)}
  }
  const readIncidents=async()=>{
    const result=await api<{list:Incident[]}>(classPath+'/incidents')
    setIncidents(result.list)
  }
  return <section className="hs-panel">
    <h2>学生账户恢复与注册异常</h2>
    <p>仅授权学校管理员或心理教师可操作。必须在线下核实学生身份；
      勾选仅记录已执行的核验步骤，不代替真实核验。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {notice&&<p className="hs-message" role="status">{notice}</p>}
    <h3>为经核验的学生签发一次性恢复码</h3>
    <TextField label="资格学号（不显示在审计记录中）" value={number} setValue={setNumber}/>
    <label className="hs-field"><span>恢复事由</span>
      <select value={reason} onChange={event=>setReason(event.target.value as typeof reason)}>
        <option value="FORGOT_PASSWORD">忘记密码</option>
        <option value="FORGOT_LOGIN">忘记登录名</option>
        <option value="INCIDENT_CORRECTION">身份事件修正</option>
      </select></label>
    <label className="hs-field"><span><input type="checkbox" checked={verified}
      onChange={event=>setVerified(event.target.checked)}/> 已在线下完成独立身份核验</span></label>
    <button disabled={busy||!number||!verified} onClick={()=>void execute(async()=>{
      const issued=await api<RecoveryReceipt>(classPath+'/student-recoveries','POST',{
        studentNumber:number,reasonCode:reason,verifiedOffline:true,
      })
      setReceipt(issued);setNumber('');setVerified(false)
      setNotice('一次性凭据已签发，请通过已核验的独立渠道交付。')
    })}>签发恢复码</button>
    {receipt&&<div className="hs-secret" role="status">
      <p>仅显示一次，交付后清除：{receipt.username}</p><code>{receipt.recoveryCode}</code>
      <p>有效期至 {new Date(receipt.expiresAt).toLocaleString('zh-CN')}</p>
      <button onClick={()=>setReceipt(null)}>已安全交付，隐藏凭据</button>
    </div>}
    <h3>班级注册异常</h3>
    <div className="hs-actions">
      <button disabled={busy} onClick={()=>void execute(async()=>{await readIncidents();setNotice('已刷新待处理异常。')})}>查看未结案异常</button>
      <label className="hs-field"><span>新增异常</span>
        <select value={incidentReason} onChange={event=>setIncidentReason(event.target.value as typeof incidentReason)}>
          <option value="ELIGIBILITY_DISPUTE">资格争议</option>
          <option value="SUSPECTED_REGISTRATION_TAKEOVER">疑似抢注</option>
          <option value="OTHER_REGISTRATION_ERROR">注册流程异常</option>
        </select></label>
      <button disabled={busy} onClick={()=>void execute(async()=>{
        await api(classPath+'/incidents','POST',{reason:incidentReason})
        await readIncidents()
        setNotice('异常已登记，整班审批暂时不能通过。')
      })}>登记异常</button>
    </div>
    {incidents.length>0&&<label className="hs-field"><span>选择待处理异常</span>
      <select value={incidentId} onChange={event=>setIncidentId(event.target.value)}>
        <option value="">请选择</option>
        {incidents.map(item=><option value={item.id} key={item.id}>{item.reason} · {item.id.slice(0,8)}</option>)}
      </select></label>}
    {incidentId&&<div className="hs-actions">
      <label className="hs-field"><span>处理结果</span>
        <select value={resolution} onChange={event=>setResolution(event.target.value as typeof resolution)}>
          <option value="VERIFIED_CORRECT">经核验无异常</option>
          <option value="STUDENT_QUARANTINED">已隔离可疑账号</option>
          <option value="ROSTER_CORRECTED">名册已核实修正</option>
        </select></label>
      <button disabled={busy} onClick={()=>void execute(async()=>{
        await api(classPath+'/incidents/'+encodeURIComponent(incidentId)+'/resolve','POST',{resolution})
        await readIncidents();setIncidentId('');setNotice('已记入处理结果，请检查注册状态。')
      })}>关闭已核实的异常</button>
    </div>}
    <h3>紧急冻结疑似抢注的账号</h3>
    <TextField label="涉嫌被冒用的资格学号" value={quarantineNo} setValue={setQuarantineNo}/>
    <button disabled={busy||!quarantineNo} onClick={()=>void execute(async()=>{
      if(!window.confirm('确认冻结该校园账号及其现有会话？历史测评归属不会迁移。'))return
      await api(classPath+'/quarantine','POST',{studentNumber:quarantineNo})
      setQuarantineNo('');await readIncidents()
      setNotice('账号已冻结，独立异常记录已生成。请完成线下身份核实。')
    })}>冻结疑似抢注身份</button>
  </section>
}
