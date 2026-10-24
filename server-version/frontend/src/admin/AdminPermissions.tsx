import {useCallback,useEffect,useRef,useState} from 'react'
import api from '../api/client'
import {UsersRound,KeyRound,Search,ChevronDown,ShieldCheck,History} from 'lucide-react'
import {entryLabels,type AdminEntry} from './authority'
import AdminStepUp from './AdminStepUp'
import AdminContentPermissions from './AdminContentPermissions'
import {useAuth} from '../contexts/AuthContext'
type Account={id:string;username:string;platformRole:string;entries:Array<{entry:AdminEntry;active:boolean;version:number}>}
type Audit={id:string;action:string;entry:AdminEntry|null;version:number|null;reason:string;createdAt:string}
export default function AdminPermissions(){
  const {user}=useAuth()
  const [accounts,setAccounts]=useState<Account[]>([]),[page,setPage]=useState(1),[keyword,setKeyword]=useState(''),[search,setSearch]=useState('')
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [audit,setAudit]=useState<Audit[]>([])
  const reasonPanel=useRef<HTMLDetailsElement>(null)
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState<'accounts'|'content'>('accounts'),[auditAccount,setAuditAccount]=useState('')
  const load=useCallback(async()=>{setLoading(true);try{const result=await api.get<{accounts:Account[]}>('/admin/permissions/accounts?page='+page+'&keyword='+encodeURIComponent(search));setAccounts(result.data!.accounts)}finally{setLoading(false)}},[page,search])
  useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
  const change=async(account:Account,grant:Account['entries'][number])=>{
    if(!reason.trim()){setError('请填写授权变更原因');if(reasonPanel.current)reasonPanel.current.open=true;return}
    if(!window.confirm(`${grant.active?'撤销':'授予'} ${account.username} 的${entryLabels[grant.entry]}权限？`))return
    setBusy(true);setError('');setNotice('')
    try{await api.put(`/admin/permissions/accounts/${account.id}/entries/${grant.entry}`,{active:!grant.active,expectedVersion:grant.version,reason:reason.trim()});await load();setNotice('授权已更新，目标账号的旧会话已失效。')}
    catch(e){setError(e instanceof Error?e.message:'操作未完成；请刷新核对当前权限后再试')}
    finally{setBusy(false)}
  }
  return <div className="system-page system-permissions">
    <header className="sys-heading"><div><p className="system-eyebrow">身份与访问</p><h1>管理授权</h1><p>入口资格与精确内容授权分别管理，每次变更保留处理依据。</p></div><span className="sys-heading-mark"><KeyRound size={26} aria-hidden="true"/></span></header>
    <nav className="sys-view-tabs" aria-label="授权管理视图"><button aria-pressed={view==='accounts'} onClick={()=>setView('accounts')}><UsersRound size={17} aria-hidden="true"/>入口管理员</button><button aria-pressed={view==='content'} onClick={()=>setView('content')}><KeyRound size={17} aria-hidden="true"/>精确内容授权</button></nav>
    {error&&<p className="sys-message sys-error" role="alert">{error}</p>}{notice&&<p className="sys-message" role="status">{notice}</p>}
    <div className="sys-workspace"><div className="sys-content">
    <section hidden={view!=='accounts'} aria-label="入口管理员" className="sys-panel">
      <div className="sys-section-heading"><div><h2>入口管理员</h2><p>查看账号当前资格，展开卡片管理各入口权限。</p></div><span className="sys-badge">本页 {accounts.length} 位</span></div>
      <form className="sys-search" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(keyword.trim())}}><label><Search size={17} aria-hidden="true"/><span className="sr-only">查找管理账号</span><input placeholder="搜索管理员账号" disabled={busy||loading} value={keyword} onChange={e=>setKeyword(e.target.value)}/></label><button type="submit" disabled={busy||loading}>查找</button></form>
      {loading&&<p role="status" className="sys-empty">正在读取账号…</p>}
      {!loading&&!accounts.length&&<div className="sys-empty"><UsersRound size={28} aria-hidden="true"/><h3>没有匹配的账号</h3><p>调整关键词后再次查找。</p></div>}
      <div className="sys-records">{accounts.map(account=><article className="sys-record" key={account.id}><details>
        <summary><span className="sys-record-avatar"><UsersRound size={20} aria-hidden="true"/></span><span className="sys-record-heading"><strong>{account.username}</strong><small>{account.platformRole==='SYSTEM_ADMIN'?'系统管理员':account.entries.some(g=>g.active)?'入口管理员':'尚无入口管理权限'} · {account.entries.filter(g=>g.active).length} 个入口已授权</small></span><span className="sys-expand">管理<ChevronDown size={17} aria-hidden="true"/></span></summary>
        <div className="sys-record-body"><div className="sys-grant-grid">{account.entries.map(grant=><div key={grant.entry} className="sys-grant"><div><strong>{entryLabels[grant.entry]}</strong><span className="sys-badge" data-active={grant.active}>{grant.active?'已授权':'未授权'}</span></div><button disabled={busy||loading} aria-label={`${grant.active?'撤销':'授予'} ${account.username} ${grant.entry}`} onClick={()=>void change(account,grant)}>{grant.active?'撤销权限':'授予权限'}</button></div>)}</div>
        <button className="sys-text-button" onClick={()=>{setAuditAccount(account.username);void api.get<Audit[]>('/admin/permissions/audit?targetUserId='+account.id).then(r=>setAudit(r.data!)).catch(e=>setError(e.message))}}><History size={15} aria-hidden="true"/>查看 {account.username} 审计</button></div>
      </details></article>)}</div>
      <nav className="system-pagination" aria-label="管理员列表分页"><span>第 {page} 页</span><div><button disabled={page===1||busy||loading} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={accounts.length<25||busy||loading} onClick={()=>setPage(p=>p+1)}>下一页</button></div></nav>
      <details className="sys-audit-history" open={auditAccount?true:undefined}><summary><History size={16} aria-hidden="true"/>最近授权审计{auditAccount&&' · '+auditAccount}</summary>{!audit.length?<p className="sys-muted">{auditAccount?'该账号暂无可见审计记录。':'在账号卡片中选择“查看审计”。'}</p>:<ol className="sys-timeline">{audit.map(row=><li key={row.id}><div><strong>{row.action} · {row.entry?entryLabels[row.entry]:'系统'}</strong><time>{new Date(row.createdAt).toLocaleString()}</time></div><p>{row.reason}</p></li>)}</ol>}</details>
    </section>
    <section hidden={view!=='content'} className="sys-panel sys-content-grants" aria-label="精确内容授权">{user&&<AdminContentPermissions key={user.id} actorId={user.id}/>}</section>
    </div><aside className="sys-rail" aria-label="授权操作准备"><details className="sys-panel sys-verification"><summary><ShieldCheck size={18} aria-hidden="true"/>操作验证</summary><p className="sys-muted">敏感变更前完成双因素验证，有效期五分钟。</p><AdminStepUp/></details><details ref={reasonPanel} className="sys-panel sys-reason" hidden={view!=='accounts'}><summary>变更依据</summary><label className="system-field">本次变更原因<textarea rows={4} maxLength={500} placeholder="说明本次授予或撤销权限的原因" value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="sys-hint">填写原因后，在账号详情中操作；提交时仍需确认。</p></details><details className="sys-panel sys-guide"><summary>权限边界说明</summary><p>入口授权分别生效，不授予其他入口权限，也不修改账号业务身份。</p><p>系统管理员不负责研究者邀请、资格管理或研究者工具分配；这些由独立 Survey 管理员处理。</p></details></aside></div>
  </div>
}
