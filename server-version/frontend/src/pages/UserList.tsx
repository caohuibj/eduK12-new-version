import React, { useState, useEffect } from 'react'
import { Search, Users, Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import apiClient from '../api/client'
import type { User } from '../types'

type UserTab = 'TEACHER' | 'STUDENT'

const UserList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserTab>('TEACHER')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [extendingUser, setExtendingUser] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/users')
      if (response.code === 0) {
        setUsers(response.data.list)
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId: string) => {
    try {
      const response = await apiClient.post(`/users/${userId}/approve-teacher`)
      if (response.code === 0) {
        alert('已通过该教师的注册审核')
        fetchUsers()
      } else {
        alert(response.message || '审核失败')
      }
    } catch (error: any) {
      alert(error.message || '审核失败')
    }
  }

  const handleExtend = async (userId: string, months: number = 12) => {
    try {
      setExtendingUser(userId)
      const response = await apiClient.post('/auth/extend-account', {
        userId,
        months,
      })
      if (response.code === 0) {
        alert(`账号已成功延期${months}个月`)
        fetchUsers()
      } else {
        alert(response.message || '延期失败')
      }
    } catch (error: any) {
      alert(error.message || '延期失败')
    } finally {
      setExtendingUser(null)
    }
  }

  const filteredUsers = users.filter((user) => {
    if (user.role !== activeTab) return false
    if (!searchKeyword) return true
    const keyword = searchKeyword.toLowerCase()
    return (
      user.username.toLowerCase().includes(keyword) ||
      (user.nickname && user.nickname.toLowerCase().includes(keyword))
    )
  })

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '永久有效'
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN')
  }

  const isExpired = (dateString: string | null | undefined) => {
    if (!dateString) return false
    return new Date(dateString) < new Date()
  }

  const getDaysRemaining = (dateString: string | null | undefined) => {
    if (!dateString) return null
    const days = Math.ceil((new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return days
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">用户管理</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索用户名或姓名..."
            className="input pl-10 w-64"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('TEACHER')}
          className={`flex items-center space-x-2 px-6 py-2 rounded-md transition-colors ${
            activeTab === 'TEACHER'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>教师 ({users.filter(u => u.role === 'TEACHER').length})</span>
        </button>
        <button
          onClick={() => setActiveTab('STUDENT')}
          className={`flex items-center space-x-2 px-6 py-2 rounded-md transition-colors ${
            activeTab === 'STUDENT'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>学生 ({users.filter(u => u.role === 'STUDENT').length})</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchKeyword ? '未找到匹配的用户' : `暂无${activeTab === 'TEACHER' ? '教师' : '学生'}用户`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  姓名
                </th>
                {activeTab === 'TEACHER' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    有效期
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  注册时间
                </th>
                {activeTab === 'TEACHER' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => {
                const daysRemaining = getDaysRemaining(user.expiresAt)
                const expired = isExpired(user.expiresAt)

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.nickname || '-'}
                    </td>
                    {activeTab === 'TEACHER' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className={`text-sm ${expired ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                            {formatDate(user.expiresAt)}
                          </span>
                          {daysRemaining !== null && !expired && daysRemaining <= 30 && (
                            <span className="text-xs text-orange-500">
                              (剩余{daysRemaining}天)
                            </span>
                          )}
                          {expired && (
                            <span className="text-xs text-red-500 font-medium">
                              (已过期)
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.role === 'TEACHER' && user.teacherApproved === false ? (
                        <span className="flex items-center text-orange-600 text-sm">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          待审核
                        </span>
                      ) : user.isFrozen ? (
                        <span className="flex items-center text-gray-500 text-sm">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          已冻结
                        </span>
                      ) : user.isActive ? (
                        <span className="flex items-center text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          正常
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">已禁用</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    {activeTab === 'TEACHER' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          {user.teacherApproved === false && (
                            <button
                              onClick={() => handleApprove(user.id)}
                              className="text-sm text-green-700 hover:text-green-800 flex items-center space-x-1"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>通过</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExtend(user.id, 12)}
                            disabled={extendingUser === user.id}
                            className="text-sm text-primary hover:text-primary-dark flex items-center space-x-1"
                          >
                            <Clock className="w-4 h-4" />
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
      )}

      {/* Summary */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">📊 用户统计</p>
        <p>
          教师: {users.filter(u => u.role === 'TEACHER').length} 人 | 
          学生: {users.filter(u => u.role === 'STUDENT').length} 人 | 
          总计: {users.length} 人
        </p>
      </div>
    </div>
  )
}

export default UserList
