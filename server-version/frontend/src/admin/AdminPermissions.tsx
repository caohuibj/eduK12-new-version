import {useCallback,useEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import api from '../api/client'
import {UsersRound,KeyRound,Search,ChevronDown,ShieldCheck,History} from 'lucide-react'
import {entryLabels,type AdminEntry} from './authority'
import AdminStepUp from './AdminStepUp'
import EntryOffboarding from './EntryOffboarding'
import AdminContentPermissions from './AdminContentPermissions'
import AdminToolLicenses from './AdminToolLicenses'
import {StandardDelegationReviewPanel} from './StandardDelegationReviewPanel'
import {readToolLicenseFocus} from './toolLicenseFocus'
import {useAuth} from '../contexts/AuthContext'
const accountLabels={ACTIVE:'可登录',FROZEN:'已冻结',EXPIRED:'已过期',INACTIVE:'未启用或待审核',PASSWORD_CHANGE_REQUIRED:'待激活或待改密'}
const mfaLabels={TOTP:'已绑定 Authenticator',SECURITY_KEY_ONLY:'仅绑定安全密钥',UNBOUND:'待绑定 Authenticator'}
type Enrollment={username:string;enrollmentToken:string;initialActivation:boolean;expiresAt:string}
type Account={id:string;username:string;platformRole:string;accountStatus:keyof typeof accountLabels;mfaStatus:keyof typeof mfaLabels;operable:boolean;entries:Array<{entry:AdminEntry;active:boolean;version:number}>}
type Audit={id:string;action:string;entry:AdminEntry|null;version:number|null;reason:string;createdAt:string}
export default function AdminPermissions(){
  const {search}=useLocation()
  return <PermissionsWorkspace key={search} urlSearch={search}/>
}
function PermissionsWorkspace({urlSearch}:{urlSearch:string}){
  const {user}=useAuth()
  const params=new URLSearchParams(urlSearch),startInTools=params.get('view')==='tools'
  const toolFocus=startInTools?readToolLicenseFocus(params):undefined
  const [accounts,setAccounts]=useState<Account[]>([]),[page,setPage]=useState(1),[keyword,setKeyword]=useState(''),[search,setSearch]=useState('')
  const [newUsername,setNewUsername]=useState(''),[newEntry,setNewEntry]=useState<AdminEntry>('TRAINING')
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[operableOnPage,setOperableOnPage]=useState(0)
  const [offboarding,setOffboarding]=useState<{account:Account;grant:Account['entries'][number]}|null>(null)
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [audit,setAudit]=useState<Audit[]>([]),[auditLoading,setAuditLoading]=useState(false),[auditError,setAuditError]=useState('')
  const auditRequest=useRef(0)
  useEffect(()=>()=>{auditRequest.current++},[])
  const reasonPanel=useRef<HTMLDetailsElement>(null)
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState<'accounts'|'content'|'tools'>(startInTools?'tools':'accounts'),[auditAccount,setAuditAccount]=useState('')
  const [toolsVisited,setToolsVisited]=useState(startInTools)
  const load=useCallback(async()=>{setLoading(true);try{const result=await api.get<{accounts:Account[];operableOnPage:number}>('/admin/permissions/accounts?page='+page+'&keyword='+encodeURIComponent(search));setAccounts(result.data!.accounts);setOperableOnPage(result.data!.operableOnPage??0)}finally{setLoading(false)}},[page,search])
  useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
  const readAudit=async(account:Account)=>{
    const request=++auditRequest.current
    setAuditAccount(account.username);setAudit([]);setAuditError('');setAuditLoading(true)
    try{
      const result=await api.get<Audit[]>('/admin/permissions/audit?targetUserId='+account.id)
      if(request===auditRequest.current)setAudit(result.data??[])
    }catch(e){if(request===auditRequest.current)setAuditError(e instanceof Error?e.message:'审计记录读取失败，请重新选择账号重试')}
    finally{if(request===auditRequest.current)setAuditLoading(false)}
  }
  const issueEnrollment=async(account?:Account)=>{
    if(!reason.trim()){setError('请填写变更原因');if(reasonPanel.current)reasonPanel.current.open=true;return}
    setBusy(true);setError('');setNotice('');setEnrollment(null)
    try{
      const result=await api.post<Enrollment>(account?'/admin/permissions/accounts/'+account.id+'/enrollment':'/admin/permissions/accounts',
        account?{reason:reason.trim()}:{username:newUsername.trim(),entry:newEntry,reason:reason.trim()})
      setEnrollment(result.data!)
      if(!account)setNewUsername('')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'签发未完成，请核对账号状态后再试')}
    finally{setBusy(false)}
  }
  const change=async(account:Account,grant:Account['entries'][number])=>{
    if(grant.active){setOffboarding({account,grant});return}
    if(!reason.trim()){setError('请填写授权变更原因');if(reasonPanel.current)reasonPanel.current.open=true;return}
    if(!window.confirm(`授予 ${account.username} 的${entryLabels[grant.entry]}权限？`))return
    setBusy(true);setError('');setNotice('')
    try{await api.put(`/admin/permissions/accounts/${account.id}/entries/${grant.entry}`,{active:true,expectedVersion:grant.version,reason:reason.trim()});await load();setNotice('授权已更新，目标账号的旧会话已失效。')}
    catch(e){setError(e instanceof Error?e.message:'操作未完成；请刷新核对当前权限后再试')}
    finally{setBusy(false)}
  }
  return <div className="system-page system-permissions">
    {offboarding&&<EntryOffboarding account={offboarding.account} entry={offboarding.grant.entry} currentVersion={offboarding.grant.version}
      onClose={()=>setOffboarding(null)} onComplete={()=>{setOffboarding(null);setNotice('入口权限已撤销，原会话已失效。');void load().catch(cause=>setError(cause.message))}}/>}
    <header className="sys-heading"><div><p className="system-eyebrow">身份与访问</p><h1>管理授权</h1><p>入口资格、工具许可与精确内容授权分别管理，每次变更保留处理依据。</p></div><span className="sys-heading-mark"><KeyRound size={26} aria-hidden="true"/></span></header>
    <nav className="sys-view-tabs" aria-label="授权管理视图"><button aria-pressed={view==='accounts'} onClick={()=>setView('accounts')}><UsersRound size={17} aria-hidden="true"/>入口管理员</button><button aria-pressed={view==='content'} onClick={()=>setView('content')}><KeyRound size={17} aria-hidden="true"/>精确内容授权</button><button aria-pressed={view==='tools'} onClick={()=>{setToolsVisited(true);setView('tools')}}><KeyRound size={17} aria-hidden="true"/>工具授权</button></nav>
    {error&&<p className="sys-message sys-error" role="alert">{error}</p>}{notice&&<p className="sys-message" role="status">{notice}</p>}
    <div className="sys-workspace"><div className="sys-content">
    <section hidden={view!=='accounts'} aria-label="入口管理员" className="sys-panel">
      <div className="sys-section-heading"><div><h2>入口管理员</h2><p>查看账号当前资格，展开卡片管理各入口权限。</p></div><span className="sys-badge">本页可操作管理员 {operableOnPage} 位</span></div>
      <details className="sys-record">
        <summary>新建入口管理员</summary>
        <form className="sys-record-body" onSubmit={e=>{e.preventDefault();void issueEnrollment()}}>
          <label className="system-field">新管理账号<input value={newUsername} onChange={e=>setNewUsername(e.target.value)} autoComplete="off" required minLength={4} maxLength={64}/></label>
          <label className="system-field">授权入口<select value={newEntry} onChange={e=>setNewEntry(e.target.value as AdminEntry)}>
            {Object.entries(entryLabels).map(([entry,label])=><option value={entry} key={entry}>{label}</option>)}
          </select></label>
          <button type="submit" disabled={busy||loading}>新建并签发绑定码</button>
        </form>
      </details>
      {enrollment&&<section className="sys-record" aria-label="私密绑定信息">
        <div className="sys-record-body">
          <p>账号 {enrollment.username} 的绑定码在 {new Date(enrollment.expiresAt).toLocaleTimeString('zh-CN')} 前可用。请通过已核实的私密渠道交给本人。</p>
          <label className="system-field">一次性绑定码<input readOnly value={enrollment.enrollmentToken} autoComplete="off" /></label>
          <p>{enrollment.initialActivation?'本人在绑定页自行设置密码。':'本人在绑定页使用当前密码。'}绑定完成后再登录。</p>
          <a href={'/admin/security/enroll'+(enrollment.initialActivation?'?activate=1':'')} target="_blank" rel="noreferrer">打开绑定页</a>
          <button onClick={()=>setEnrollment(null)}>关闭绑定信息</button>
        </div>
      </section>}
      <form className="sys-search" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(keyword.trim())}}><label><Search size={17} aria-hidden="true"/><span className="sr-only">查找管理账号</span><input placeholder="搜索管理员账号" disabled={busy||loading} value={keyword} onChange={e=>setKeyword(e.target.value)}/></label><button type="submit" disabled={busy||loading}>查找</button></form>
      {loading&&<p role="status" className="sys-empty">正在读取账号…</p>}
      {!loading&&!accounts.length&&<div className="sys-empty"><UsersRound size={28} aria-hidden="true"/><h3>没有匹配的账号</h3><p>调整关键词后再次查找。</p></div>}
      <div className="sys-records">{accounts.map(account=><article className="sys-record" key={account.id}><details>
        <summary><span className="sys-record-avatar"><UsersRound size={20} aria-hidden="true"/></span><span className="sys-record-heading"><strong>{account.username}</strong><small>{account.platformRole==='SYSTEM_ADMIN'?'系统管理员':account.entries.some(g=>g.active)?'入口管理员':'尚无入口管理权限'} · {account.entries.filter(g=>g.active).length} 个入口已授权{account.accountStatus&&' · '+accountLabels[account.accountStatus]}{account.mfaStatus&&' · '+mfaLabels[account.mfaStatus]}</small></span><span className="sys-expand">管理<ChevronDown size={17} aria-hidden="true"/></span></summary>
        <div className="sys-record-body"><div className="sys-grant-grid">{account.entries.map(grant=><div key={grant.entry} className="sys-grant"><div><strong>{entryLabels[grant.entry]}</strong><span className="sys-badge" data-active={grant.active}>{grant.active?(account.operable===false?'已授权 · 暂不可操作':'已授权'):'未授权'}</span></div><button disabled={busy||loading||(!grant.active&&account.platformRole==='SYSTEM_ADMIN')} aria-label={`${grant.active?'撤销':'授予'} ${account.username} ${grant.entry}`} onClick={()=>void change(account,grant)}>{grant.active?'撤销权限':'授予权限'}</button></div>)}</div>
        {account.platformRole==='STANDARD'&&account.entries.some(grant=>grant.active)&&account.mfaStatus==='UNBOUND'
          &&['ACTIVE','PASSWORD_CHANGE_REQUIRED'].includes(account.accountStatus)&&
          <button className="sys-text-button" disabled={busy||loading} onClick={()=>void issueEnrollment(account)}>签发绑定码</button>}
        <button className="sys-text-button" onClick={()=>void readAudit(account)}><History size={15} aria-hidden="true"/>查看 {account.username} 审计</button>
        {account.platformRole==='STANDARD'&&<StandardDelegationReviewPanel accountId={account.id} accountLabel={account.username}/>}</div>
      </details></article>)}</div>
      <nav className="system-pagination" aria-label="管理员列表分页"><span>第 {page} 页</span><div><button disabled={page===1||busy||loading} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={accounts.length<25||busy||loading} onClick={()=>setPage(p=>p+1)}>下一页</button></div></nav>
      <details className="sys-audit-history" open={auditAccount?true:undefined}><summary><History size={16} aria-hidden="true"/>最近授权审计{auditAccount&&' · '+auditAccount}</summary>{auditLoading?<p className="sys-muted" role="status">正在读取 {auditAccount} 的审计记录…</p>:auditError?<p className="sys-error" role="alert">{auditError}</p>:!audit.length?<p className="sys-muted">{auditAccount?'该账号暂无可见审计记录。':'在账号卡片中选择“查看审计”。'}</p>:<ol className="sys-timeline">{audit.map(row=><li key={row.id}><div><strong>{row.action} · {row.entry?entryLabels[row.entry]:'系统'}</strong><time>{new Date(row.createdAt).toLocaleString()}</time></div><p>{row.reason}</p></li>)}</ol>}</details>
    </section>
    <section hidden={view!=='content'} className="sys-panel sys-content-grants" aria-label="精确内容授权">{user&&<AdminContentPermissions key={user.id} actorId={user.id}/>}</section>
    <section hidden={view!=='tools'} className="sys-panel" aria-label="工具授权工作台">{toolsVisited&&user&&<AdminToolLicenses key={user.id} actorId={user.id} active={view==='tools'} focus={toolFocus}/>}</section>
    </div><aside className="sys-rail" aria-label="授权操作准备"><details className="sys-panel sys-verification"><summary><ShieldCheck size={18} aria-hidden="true"/>操作验证</summary><p className="sys-muted">敏感变更前完成双因素验证，有效期五分钟。</p><AdminStepUp/></details><details ref={reasonPanel} className="sys-panel sys-reason" hidden={view!=='accounts'}><summary>变更依据</summary><label className="system-field">本次变更原因<textarea rows={4} maxLength={500} placeholder="说明本次授予或撤销权限的原因" value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="sys-hint">填写原因后，在账号详情中操作；提交时仍需确认。</p></details><details className="sys-panel sys-guide"><summary>权限边界说明</summary><p>入口授权分别生效，不授予其他入口权限，也不修改账号业务身份。</p><p>系统管理员不负责研究者邀请、资格管理或研究者工具分配；这些由独立 Survey 管理员处理。</p></details></aside></div>
  </div>
}
