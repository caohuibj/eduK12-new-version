import React, { useEffect, useState } from 'react'
import { AlertCircle, Calendar, CheckCircle, Clock, Search, Users } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader } from '../components/product-ui/PageHeader'
import { ProductPage } from '../components/product-ui/ProductPage'
import type { User } from '../types'

type UserTab = 'TEACHER' | 'STUDENT'

const UserList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserTab>('TEACHER')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [extendingUser, setExtendingUser] = useState<string | null>(null)

  useEffect(() => {
    void fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/users')
      if (response.code === 0) {
        setUsers(response.data.list)
      } else {
        setError(response.message || '获取用户列表失败')
      }
    } catch (fetchError) {
      console.error('获取用户列表失败:', fetchError)
      setError((fetchError as { message?: string }).message || '获取用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId: string) => {
    try {
      const response = await apiClient.post(`/users/${userId}/approve-teacher`)
      if (response.code === 0) {
        alert('已通过该教师的注册审核')
        void fetchUsers()
      } else {
        alert(response.message || '审核失败')
      }
    } catch (operationError: any) {
      alert(operationError.message || '审核失败')
    }
  }

  const handleExtend = async (userId: string, months: number = 12) => {
    try {
      setExtendingUser(userId)
      const response = await apiClient.post('/auth/extend-account', { userId, months })
      if (response.code === 0) {
        alert(`账号已成功延期${months}个月`)
        void fetchUsers()
      } else {
        alert(response.message || '延期失败')
      }
    } catch (operationError: any) {
      alert(operationError.message || '延期失败')
    } finally {
      setExtendingUser(null)
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

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader
        title="用户管理"
        description="审核教师账号、查看学生账号，并维护教师账号有效期。"
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
            className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors sm:px-6 ${activeTab === 'TEACHER' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />教师 ({teacherCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('STUDENT')}
            aria-pressed={activeTab === 'STUDENT'}
            className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors sm:px-6 ${activeTab === 'STUDENT' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />学生 ({studentCount})
          </button>
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
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <span className="sr-only">正在加载用户列表</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center">
          <Users className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">{searchKeyword ? '未找到匹配的用户' : `暂无${activeTab === 'TEACHER' ? '教师' : '学生'}用户`}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">用户名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">姓名</th>
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
                              className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark disabled:opacity-50"
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
        <p>教师: {teacherCount} 人 · 学生: {studentCount} 人 · 总计: {users.length} 人</p>
      </div>
    </ProductPage>
  )
}

export default UserList