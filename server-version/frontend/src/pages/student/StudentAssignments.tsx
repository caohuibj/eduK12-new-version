import React, { useState, useEffect } from 'react'
import { BookOpen, CheckCircle, Clock, ClipboardList, XCircle } from 'lucide-react'
import apiClient from '../../api/client'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import type { Assignment, Submission } from '../../types'

const StudentAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<(Assignment & { submitted?: boolean; mySubmission?: Submission })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchAssignments()
  }, [])

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/assignments/my')
      if (response.code !== 0) throw new Error(response.message || '获取作业列表失败')
      setAssignments(response.data.list)
    } catch (reason) {
      console.error('获取作业列表失败:', reason)
      setError(reason instanceof Error ? reason.message : '获取作业列表失败')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString || dateString === 'Invalid Date') return '无截止日期'
    try {
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) return '无截止日期'
      return date.toLocaleString('zh-CN')
    } catch {
      return '无截止日期'
    }
  }

  const isOverdue = (deadline?: string) => Boolean(deadline && new Date(deadline) < new Date())

  const getStatus = (assignment: Assignment & { submitted?: boolean }) => {
    if (assignment.submitted) return { label: '已提交', className: 'bg-emerald-50 text-emerald-800', icon: CheckCircle }
    if (isOverdue(assignment.deadline)) return { label: '已截止', className: 'bg-slate-100 text-slate-700', icon: XCircle }
    return { label: '进行中', className: 'bg-blue-50 text-blue-800', icon: Clock }
  }

  return (
    <ProductPage width="assessment">
      <PageHeader title="我的作业" description="查看课程作业状态，并打开对应提交记录。" />

      {loading ? (
        <ProductStatus kind="pending" title="正在加载作业" announce="polite" />
      ) : error ? (
        <ProductStatus kind="error" title="作业列表加载失败" announce="assertive">{error}</ProductStatus>
      ) : assignments.length === 0 ? (
        <ProductStatus kind="info" title="暂无作业">你还没有需要完成的作业。</ProductStatus>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => {
            const status = getStatus(assignment)
            const StatusIcon = status.icon
            return (
              <DiscoveryCard
                key={assignment.id}
                to={`/student/assignments/${assignment.id}`}
                title={assignment.title}
                ariaLabel={`${assignment.title}，${assignment.submitted ? '查看已提交作业' : '打开作业'}`}
                leading={<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><ClipboardList className="h-5 w-5" /></span>}
                status={<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span>}
                description={assignment.description}
                meta={(
                  <>
                    <span className={`inline-flex items-center gap-1.5 ${isOverdue(assignment.deadline) && !assignment.submitted ? 'text-red-600' : ''}`}><Clock className="h-4 w-4" aria-hidden="true" />截止：{formatDate(assignment.deadline)}</span>
                    {assignment.course ? <span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" aria-hidden="true" />{assignment.course.title}</span> : null}
                  </>
                )}
              />
            )
          })}
        </div>
      )}
    </ProductPage>
  )
}

export default StudentAssignments
