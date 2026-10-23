import { Link } from 'react-router-dom'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Calendar, CheckCircle, Clock, Search, Users, SlidersHorizontal, ChevronDown } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader } from '../components/product-ui/PageHeader'
import { ProductPage } from '../components/product-ui/ProductPage'
import type { User } from '../types'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

type UserTab = 'TEACHER' | 'STUDENT' | 'PARENT'

const UserList: React.FC<{training?:boolean}> = ({training=false}) => {
  const { feedback, info,confirm,success:notifySuccess,error:notifyError } = useStaffFeedback({dialogClassName:training?'training-accounts-dialog':undefined})
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const [activeTab, setActiveTab] = useState<UserTab>('TEACHER')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [extendingUser, setExtendingUser] = useState<string | null>(null)
  const [approvingUser,setApprovingUser]=useState<string|null>(null)
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[total,setTotal]=useState(0)
  const requestId=useRef(0)
  const serverRole=training?activeTab:undefined


  const fetchUsers = useCallback(async () => {
    const id=++requestId.current
    try {
      setLoading(true);setError(null)
      const response=training
        ?await apiClient.get('/users',{params:{scope:'training-participants',role:serverRole,keyword:query||undefined,page,pageSize:20}})
        :await apiClient.get('/users')
      if(id!==requestId.current)return
      if(response.code===0){setUsers(response.data.list);setTotal(response.data.total??response.data.list.length)}
      else setError(response.message||'获取账号列表失败')
    }catch(fetchError){
      if(id===requestId.current)setError((fetchError as {message?:string}).message||'获取账号列表失败')
    }finally{if(id===requestId.current)setLoading(false)}
  },[training,serverRole,query,page])
  useEffect(()=>{const sequence=requestId;void fetchUsers();return()=>{sequence.current++}},[fetchUsers])

  const handleApprove = async (userId: string) => {
    if(approvingUser)return
    const target=users.find(user=>user.id===userId)
    if(training&&!await confirm({title:'确认通过培训师审核',body:`请确认 ${target?.nickname||target?.username||'该账号'} 的培训师资格已核实。通过后，该账号将获得现有培训师业务权限。`,confirmLabel:'确认通过'}))return
    setApprovingUser(userId)
    try {
      const response=await apiClient.post(`/users/${userId}/approve-teacher`)
      if(response.code!==0)throw new Error(response.message||'审核失败')
      if(training)notifySuccess('审核已通过','该培训师账号已通过注册审核。')
      else showMessage('已通过该教师的注册审核')
      await fetchUsers()
    }catch(operationError){
      const message=(operationError as {message?:string}).message||'审核失败'
      if(training)notifyError('审核未完成',message);else showMessage(message)
    }finally{setApprovingUser(null)}
  }

  const handleExtend = async (userId: string, months: number = 12) => {
    if(extendingUser)return
    const target=users.find(user=>user.id===userId)
    if(training&&!await confirm({title:'确认延长账号有效期',body:`将 ${target?.nickname||target?.username||'该账号'} 的有效期延长 ${months} 个月。`,confirmLabel:'确认延期'}))return
    try {
      setExtendingUser(userId)
      const response = await apiClient.post('/auth/extend-account', { userId, months })
      if (response.code === 0) {
        if(training)notifySuccess('延期已完成',`账号有效期已延长 ${months} 个月。`);else showMessage(`账号已成功延期${months}个月`)
        await fetchUsers()
      } else {
        if(training)notifyError('延期未完成',response.message||'延期失败');else showMessage(response.message || '延期失败')
      }
    } catch (operationError: any) {
      if(training)notifyError('延期未完成',operationError.message||'延期失败');else showMessage(operationError.message || '延期失败')
    } finally {
      setExtendingUser(null)
    }
  }

  const copyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId)
      showMessage('用户 ID 已复制')
    } catch {
      showMessage('复制失败，请选中用户 ID 手动复制')
    }
  }

  const filteredUsers = users.filter(user => {
    if (user.role !== activeTab) return false
    if (!searchKeyword) return true
    const keyword = searchKeyword.toLowerCase()
    return user.username.toLowerCase().includes(keyword)
      || Boolean(user.nickname?.toLowerCase().includes(keyword))
  })

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '永久有效'
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const isExpired = (dateString: string | null | undefined) => (
    Boolean(dateString && new Date(dateString) < new Date())
  )

  const getDaysRemaining = (dateString: string | null | undefined) => {
    if (!dateString) return null
    return Math.ceil((new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const teacherCount = users.filter(user => user.role === 'TEACHER').length
  const studentCount = users.filter(user => user.role === 'STUDENT').length
  const parentCount = users.filter(user => user.role === 'PARENT').length

  if(training){
    const status=(user:User)=>user.role==='TEACHER'&&user.teacherApproved===false?{label:'待审核',tone:'pending'}:user.isFrozen?{label:'已冻结',tone:'muted'}:user.isActive?{label:'正常',tone:'active'}:{label:'已禁用',tone:'muted'}
    const pages=Math.max(1,Math.ceil(total/20)),busy=Boolean(approvingUser||extendingUser)
    return <section className="training-accounts training-account-list" aria-label="账号列表与审核">
      {feedback}
      <div className="training-account-list-toolbar">
        <div className="training-accounts-role" role="group" aria-label="账号身份">
          {(['TEACHER','STUDENT'] as const).map(role=><button key={role} type="button" aria-pressed={activeTab===role} disabled={busy} onClick={()=>{setActiveTab(role);setPage(1)}}>{role==='TEACHER'?'培训师':'学员'}</button>)}
        </div>
        <span className="training-account-list-count">共 {total} 个账号</span>
        <button type="button" className="training-accounts-secondary training-account-filter-toggle" disabled={busy} aria-expanded={filtersOpen} aria-controls="training-account-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true"/>{filtersOpen?'收起检索':'账号检索'}<ChevronDown size={15} aria-hidden="true"/></button>
        <button type="button" className="training-accounts-secondary" disabled={loading||busy} onClick={()=>void fetchUsers()}>刷新列表</button>
      </div>
      {filtersOpen&&<section id="training-account-filters" aria-label="账号检索"><form className="training-accounts-search" onSubmit={event=>{event.preventDefault();setPage(1);setQuery(searchKeyword.trim());setFiltersOpen(false)}}>
        <label><span>搜索账号</span><span className="training-accounts-search-input"><Search size={17} aria-hidden="true"/><input type="search" disabled={busy} value={searchKeyword} maxLength={200} onChange={event=>setSearchKeyword(event.target.value)} placeholder="输入账号或姓名"/></span></label>
        <button type="submit" disabled={busy} className="training-accounts-primary">查询</button>
        <button type="button" disabled={busy} className="training-accounts-secondary" onClick={()=>{setSearchKeyword('');setQuery('');setPage(1)}}>重置</button>
      </form></section>}
      {query&&<div className="training-supervision-filter-summary"><span>关键词：{query}</span><button type="button" disabled={busy} onClick={()=>{setSearchKeyword('');setQuery('');setPage(1)}}>清除筛选</button></div>}
      {error&&<div className="training-accounts-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void fetchUsers()}>重新加载</button></div>}
      {loading?<p className="training-accounts-empty" role="status">正在加载账号列表…</p>:error?null:users.length===0?<div className="training-accounts-empty"><Users size={32} aria-hidden="true"/><h3>{query?'未找到匹配账号':'暂无'+(activeTab==='TEACHER'?'培训师':'学员')+'账号'}</h3><p>{query?'试试其他账号或姓名，或重置搜索条件。':'新注册账号会显示在这里。'}</p></div>:<>
        <ul className="training-account-cards" aria-label="账号列表">
          {users.map(user=>{const state=status(user),name=user.nickname||user.username;return <li key={user.id}><details className="training-account-card">
            <summary><span className="training-account-card-name"><strong>{user.username}</strong><small>{user.nickname||'未填写姓名'}</small></span><span className={'training-accounts-status training-accounts-status--'+state.tone}>{state.label}</span><ChevronDown size={16} aria-hidden="true"/></summary>
            <div className="training-account-card-details">
              <dl>
                {activeTab==='TEACHER'&&<div data-label="有效期"><dt>有效期</dt><dd className={isExpired(user.expiresAt)?'training-accounts-expired':undefined}>{formatDate(user.expiresAt)}{isExpired(user.expiresAt)&&' · 已过期'}</dd></div>}
                <div data-label="注册时间"><dt>注册时间</dt><dd>{user.createdAt?new Date(user.createdAt).toLocaleDateString('zh-CN'):'—'}</dd></div>
                <div data-label="账号 ID" className="training-account-card-id"><dt>账号 ID</dt><dd className="training-account-id-value"><code>{user.id}</code><button type="button" onClick={()=>void copyUserId(user.id)} aria-label={`复制 ${name} 的用户 ID`}>复制 ID</button></dd></div>
              </dl>
              {activeTab==='TEACHER'&&<details className="training-account-actions"><summary>管理操作<ChevronDown size={15} aria-hidden="true"/></summary><div className="training-account-actions-buttons">
                {user.teacherApproved===false&&<button type="button" className="training-accounts-primary" disabled={busy} aria-label={`通过培训师 ${name} 的注册审核`} onClick={()=>void handleApprove(user.id)}>{approvingUser===user.id?'正在审核…':'通过审核'}</button>}
                {user.expiresAt?<button type="button" className="training-accounts-secondary" disabled={busy} aria-label={`将培训师 ${name} 的账号延期 1 年`} onClick={()=>void handleExtend(user.id,12)}>{extendingUser===user.id?'正在延期…':'延期 1 年'}</button>:<span className="training-accounts-permanent">永久有效，无需延期</span>}
              </div></details>}
            </div>
          </details></li>})}
        </ul>
        <div className="training-accounts-pagination"><p>共 {total} 个{activeTab==='TEACHER'?'培训师':'学员'}账号 · 第 {page} / {pages} 页</p><div><button type="button" disabled={page<=1||busy} onClick={()=>setPage(current=>current-1)}>上一页</button><button type="button" disabled={page>=pages||busy} onClick={()=>setPage(current=>current+1)}>下一页</button></div></div>
      </>}
    </section>
  }

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="用户管理"
        description="审核教师、查看学生与家长账号，并维护账号状态。" actions={<Link to="/parent-accounts">家长账号管理</Link>}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchUsers()}>重试</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg bg-gray-100 p-1" role="group" aria-label="用户类型">
          <button
            type="button"
            onClick={() => setActiveTab('TEACHER')}
            aria-pressed={activeTab === 'TEACHER'}
            className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors sm:px-6 ${activeTab === 'TEACHER' ? 'bg-white text-action shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />教师 ({teacherCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('STUDENT')}
            aria-pressed={activeTab === 'STUDENT'}
            className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors sm:px-6 ${activeTab === 'STUDENT' ? 'bg-white text-action shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />学生 ({studentCount})
          </button>
          <button type="button" onClick={()=>setActiveTab('PARENT')} aria-pressed={activeTab==='PARENT'} className="rounded-md px-4 py-2">家长 ({parentCount})</button>
        </div>

        <label className="block w-full md:max-w-sm">
          <span className="mb-1 block text-sm font-medium text-gray-700">搜索用户</span>
          <span className="relative block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={searchKeyword}
              onChange={event => setSearchKeyword(event.target.value)}
              placeholder="用户名或姓名"
              className="input w-full pl-10"
            />
          </span>
        </label>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-action" />
          <span className="sr-only">正在加载用户列表</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center">
          <Users className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">{searchKeyword ? '未找到匹配的用户' : `暂无${activeTab === 'TEACHER' ? '教师' : activeTab==='PARENT'?'家长':'学生'}用户`}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <p className="training-user-scroll-note">左右滑动可查看姓名、完整用户 ID、状态与审核操作；也可聚焦表格后使用方向键。</p>
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="用户列表，可左右滚动查看更多列和操作">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">用户名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">姓名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">用户 ID</th>
                  {activeTab === 'TEACHER' && <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">有效期</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">注册时间</th>
                  {activeTab === 'TEACHER' && <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredUsers.map(user => {
                  const daysRemaining = getDaysRemaining(user.expiresAt)
                  const expired = isExpired(user.expiresAt)
                  const displayName = user.nickname || user.username

                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.nickname || '-'}</td>
                      <td className="px-6 py-4 text-sm"><code className="inline-block min-w-72 whitespace-nowrap">{user.id}</code><button type="button" className="ml-2 text-action underline" aria-label={`复制 ${displayName} 的用户 ID`} onClick={() => void copyUserId(user.id)}>复制 ID</button></td>
                      {activeTab === 'TEACHER' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
                            <span className={`text-sm ${expired ? 'font-medium text-red-600' : 'text-gray-600'}`}>{formatDate(user.expiresAt)}</span>
                            {daysRemaining !== null && !expired && daysRemaining <= 30 && <span className="text-xs text-orange-500">(剩余{daysRemaining}天)</span>}
                            {expired && <span className="text-xs font-medium text-red-500">(已过期)</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.role === 'TEACHER' && user.teacherApproved === false ? (
                          <span className="flex items-center text-sm text-orange-600"><AlertCircle className="mr-1 h-4 w-4" aria-hidden="true" />待审核</span>
                        ) : user.isFrozen ? (
                          <span className="flex items-center text-sm text-gray-500"><AlertCircle className="mr-1 h-4 w-4" aria-hidden="true" />已冻结</span>
                        ) : user.isActive ? (
                          <span className="flex items-center text-sm text-green-600"><CheckCircle className="mr-1 h-4 w-4" aria-hidden="true" />正常</span>
                        ) : (
                          <span className="text-sm text-gray-500">已禁用</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}</td>
                      {activeTab === 'TEACHER' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {user.teacherApproved === false && (
                              <button type="button" onClick={() => handleApprove(user.id)} className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800" aria-label={`通过教师 ${displayName} 的注册审核`}>
                                <CheckCircle className="h-4 w-4" aria-hidden="true" /><span>通过</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleExtend(user.id, 12)}
                              disabled={extendingUser === user.id}
                              className="flex items-center gap-1 text-sm text-action hover:text-action-dark disabled:opacity-50"
                              aria-label={`将教师 ${displayName} 的账号延期 1 年`}
                            >
                              <Clock className="h-4 w-4" aria-hidden="true" />
                              <span>{extendingUser === user.id ? '处理中...' : '延期1年'}</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
        <p className="mb-1 font-medium">用户统计</p>
        <p>教师: {teacherCount} 人 · 学生: {studentCount} 人 · 家长: {parentCount} 人 · 总计: {users.length} 人</p>
      </div>
    </ProductPage>
  )
}

export default UserList