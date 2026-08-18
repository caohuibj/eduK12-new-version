import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { QrCode, AlertCircle, CheckCircle } from 'lucide-react'

interface Classroom {
  id: string
  code: string
  name: string
  status: string
  course: {
    id: string
    title: string
  }
  creator: {
    id: string
    nickname: string
  }
  isInCourse: boolean
}

const ClassroomJoin: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  // 获取课堂信息
  const fetchClassroom = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<Classroom>(`/classrooms/code/${code}`)
      if (response.code === 0) {
        setClassroom(response.data)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取课堂信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code) {
      fetchClassroom()
    }
  }, [code])

  // 加入课堂（临时课堂模式，无需课程绑定）
  const handleJoin = async () => {
    if (!classroom) {
      return
    }

    if (classroom.status === 'ENDED') {
      alert('课堂已结束')
      return
    }

    // 直接跳转到答题页面
    // 即使没有登录，也可以进入课堂（临时学生模式）
    navigate(`/student/classroom/answer/${classroom.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-6 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">课堂不存在</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/student')}
            className="w-full px-4 py-2 bg-primary text-white rounded-lg"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (!classroom) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-6 max-w-md w-full">
        {/* 课堂信息 */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{classroom.name}</h1>
          <p className="text-gray-500">课堂码: {classroom.code}</p>
        </div>

        {/* 课堂详情 */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-500">课程</span>
            <span className="font-medium text-gray-900">{classroom.course.title}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-500">教师</span>
            <span className="font-medium text-gray-900">{classroom.creator.nickname}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-gray-500">状态</span>
            <span className="font-medium text-gray-900">
              {classroom.status === 'PREPARING' && '准备中'}
              {classroom.status === 'ACTIVE' && '进行中'}
              {classroom.status === 'ENDED' && '已结束'}
            </span>
          </div>
        </div>

        {/* 临时课堂提示 */}
        <div className="flex items-center justify-center gap-2 mb-6 p-3 bg-blue-50 rounded-lg">
          <CheckCircle className="w-5 h-5 text-blue-600" />
          <span className="text-blue-700 text-sm">扫码即可参与课堂答题</span>
        </div>

        {/* 操作按钮 */}
        <button
          onClick={handleJoin}
          disabled={classroom.status === 'ENDED'}
          className="w-full px-4 py-3 bg-primary text-white rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {classroom.status === 'ENDED' ? '课堂已结束' : '进入课堂'}
        </button>
      </div>
    </div>
  )
}

export default ClassroomJoin
