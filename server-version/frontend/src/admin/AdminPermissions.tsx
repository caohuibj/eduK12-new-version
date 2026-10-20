import {useCallback,useEffect,useState} from 'react'
import api from '../api/client'
import {ProductPage} from '../components/product-ui'
import {entryLabels,type AdminEntry} from './authority'
import AdminStepUp from './AdminStepUp'
type Account={id:string;username:string;platformRole:string;entries:Array<{entry:AdminEntry;active:boolean;version:number}>}
type Audit={id:string;action:string;entry:AdminEntry|null;version:number|null;reason:string;createdAt:string}
export default function AdminPermissions(){
  const [accounts,setAccounts]=useState<Account[]>([]),[page,setPage]=useState(1),[keyword,setKeyword]=useState(''),[search,setSearch]=useState('')
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [audit,setAudit]=useState<Audit[]>([])
  const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{setLoading(true);try{const result=await api.get<{accounts:Account[]}>('/admin/permissions/accounts?page='+page+'&keyword='+encodeURIComponent(search));setAccounts(result.data!.accounts)}finally{setLoading(false)}},[page,search])
  useEffect(()=>{void load().catch(e=>setError(e.message))},[load])
  const change=async(account:Account,grant:Account['entries'][number])=>{
    if(!reason.trim()){setError('请填写授权变更原因');return}
    if(!window.confirm(`${grant.active?'撤销':'授予'} ${account.username} 的${entryLabels[grant.entry]}权限？`))return
    setBusy(true);setError('');setNotice('')
    try{await api.put(`/admin/permissions/accounts/${account.id}/entries/${grant.entry}`,{active:!grant.active,expectedVersion:grant.version,reason:reason.trim()});await load();setNotice('授权已更新，目标账号的旧会话已失效。')}
    catch(e){setError(e instanceof Error?e.message:'操作未完成；请刷新核对当前权限后再试')}
    finally{setBusy(false)}
  }
  return <ProductPage><h1>系统治理与入口授权</h1><p>入口授权分别生效，不授予其他入口权限，也不修改账号业务身份。</p><AdminStepUp/>
    <form onSubmit={e=>{e.preventDefault();setPage(1);setSearch(keyword.trim())}}><label>查找管理账号<input className="input" disabled={busy||loading} value={keyword} onChange={e=>setKeyword(e.target.value)}/></label><button className="btn-secondary" type="submit" disabled={busy||loading}>查找</button></form>
    <label>本次变更原因<input className="input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}<p role="status">{notice}</p>
    <div style={{overflowX:'auto'}}><table><caption>当前入口管理授权</caption><thead><tr><th scope="col">账号</th>{Object.keys(entryLabels).map(entry=><th key={entry} scope="col">{entryLabels[entry as AdminEntry]}</th>)}<th scope="col">审计</th></tr></thead>
      <tbody>{accounts.map(account=><tr key={account.id}><th scope="row">{account.username}{account.platformRole==='SYSTEM_ADMIN'?'（系统管理员）':''}</th>
        {account.entries.map(grant=><td key={grant.entry}><button className="btn-secondary" disabled={busy||loading} aria-label={`${grant.active?'撤销':'授予'} ${account.username} ${grant.entry}`} onClick={()=>void change(account,grant)}>{grant.active?'已授权 · 撤销':'未授权 · 授予'}</button></td>)}
        <td><button className="btn-secondary" onClick={()=>{void api.get<Audit[]>('/admin/permissions/audit?targetUserId='+account.id).then(r=>setAudit(r.data!)).catch(e=>setError(e.message))}}>查看 {account.username} 审计</button></td></tr>)}</tbody></table></div>
    <button className="btn-secondary" disabled={page===1||busy||loading} onClick={()=>setPage(p=>p-1)}>上一页</button><span> 第 {page} 页 </span><button className="btn-secondary" disabled={accounts.length<25||busy||loading} onClick={()=>setPage(p=>p+1)}>下一页</button>
    <h2>最近授权审计</h2><ul>{audit.map(row=><li key={row.id}>{new Date(row.createdAt).toLocaleString()} · {row.action} · {row.entry||'系统'} · {row.reason}</li>)}</ul>
  </ProductPage>
}
