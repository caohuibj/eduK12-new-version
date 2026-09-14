import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { AlertCircle, CheckCircle, QrCode } from 'lucide-react'

interface Classroom {
  id: string
  code: string
  name: string
  status: string
  course: {
    id: string
    title: string
  }
  isInCourse: boolean
}

const statusLabel: Record<string, string> = {
  PREPARING: '准备中',
  ACTIVE: '进行中',
  ENDED: '已结束',
}

const statusClass: Record<string, string> = {
  PREPARING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ENDED: 'bg-gray-100 text-gray-700',
}

const ClassroomJoin: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClassroom = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<Classroom>(`/classrooms/code/${code}`)
      if (response.code === 0 && response.data) {
        setClassroom(response.data)
      } else {
        setClassroom(null)
        setError(response.message || '课堂信息缺失')
      }
    } catch (fetchError: any) {
      setClassroom(null)
      setError(fetchError.message || '获取课堂信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (code) void fetchClassroom()
  }, [code])

  const handleJoin = () => {
    if (!classroom) return
    if (classroom.status === 'ENDED') return

    navigate(`/student/classroom/answer/${classroom.id}?code=${encodeURIComponent(classroom.code)}`)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50" role="status" aria-live="polite">
        <div className="text-gray-500">正在加载课堂信息...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div role="alert" className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" aria-hidden="true" />
          <h1 className="mb-2 text-xl font-semibold text-gray-900">无法进入课堂</h1>
          <p className="mb-6 text-gray-500">{error}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => void fetchClassroom()} className="btn-primary">重试</button>
            <Link to="/student/classroom/enter" className="btn-secondary text-center">重新输入课堂码</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!classroom) return null

  const ended = classroom.status === 'ENDED'

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <QrCode className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">{classroom.name}</h1>
          <p className="text-gray-500">课堂码: <span className="font-mono">{classroom.code}</span></p>
        </header>

        <dl className="mb-6 space-y-3">
          <div className="flex items-center justify-between gap-4 border-b py-2">
            <dt className="text-gray-500">课程</dt>
            <dd className="text-right font-medium text-gray-900">{classroom.course.title}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-b py-2">
            <dt className="text-gray-500">状态</dt>
            <dd>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${statusClass[classroom.status] || 'bg-gray-100 text-gray-700'}`}>
                {statusLabel[classroom.status] || classroom.status}
              </span>
            </dd>
          </div>
        </dl>

        <div className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3">
          <CheckCircle className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <span className="text-sm text-blue-700">无需加入课程即可参与本次课堂答题</span>
        </div>

        {ended ? (
          <div className="space-y-3">
            <p role="status" className="text-center text-sm text-gray-600">本课堂已经结束，不能再进入答题。</p>
            <Link to="/student/classroom/enter" className="btn-secondary block w-full text-center">输入其他课堂码</Link>
          </div>
        ) : (
          <button type="button" onClick={handleJoin} className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary/90">
            进入课堂
          </button>
        )}
      </div>
    </main>
  )
}

export default ClassroomJoin