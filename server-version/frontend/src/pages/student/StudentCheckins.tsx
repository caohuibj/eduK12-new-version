import React from 'react'
import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react'
import { useCursorList } from '../../hooks/useCursorList'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import type { Checkin, CheckinSubmission } from '../../types'

const StudentCheckins: React.FC = () => {
  const { list: checkins, loading, error, more, refresh, hasMore } = useCursorList<Checkin & { submission?: CheckinSubmission }>('/checkins/my')

  const formatDate = (dateString?: string) => dateString ? new Date(dateString).toLocaleString('zh-CN') : '无截止日期'
  const isOverdue = (endTime?: string) => Boolean(endTime && new Date(endTime) < new Date())

  const getStatus = (checkin: Checkin & { submission?: CheckinSubmission }) => {
    if (checkin.submission) return { label: '已打卡', className: 'bg-emerald-50 text-emerald-800', icon: CheckCircle }
    if (isOverdue(checkin.endTime)) return { label: '已截止', className: 'bg-slate-100 text-slate-700', icon: XCircle }
    return { label: '进行中', className: 'bg-blue-50 text-blue-800', icon: Clock }
  }

  return (
    <ProductPage width="assessment" className="hui-student-page hui-student-tasks">
      <PageHeader title="我的打卡" description="查看打卡任务与已经提交的记录。" />

      {loading && checkins.length === 0 ? (
        <ProductStatus kind="pending" title="正在加载打卡" announce="polite" />
      ) : error && checkins.length === 0 ? (
        <ProductStatus kind="error" title="打卡列表加载失败" announce="assertive">{error}<button type="button" onClick={() => void refresh()}>重试</button></ProductStatus>
      ) : checkins.length === 0 ? (
        <ProductStatus kind="info" title="暂无打卡">你还没有需要打卡的任务。</ProductStatus>
      ) : (
        <div className="grid gap-4">
          {checkins.map((checkin) => {
            const status = getStatus(checkin)
            const StatusIcon = status.icon
            return (
              <DiscoveryCard
                key={checkin.id}
                to={`/student/checkins/${checkin.id}`}
                title={checkin.title}
                ariaLabel={`${checkin.title}，${checkin.submission ? '查看打卡记录' : '打开打卡任务'}`}
                leading={<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Calendar className="h-5 w-5" /></span>}
                status={<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span>}
                description={checkin.description}
                meta={(
                  <>
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />截止：{formatDate(checkin.endTime)}</span>
                    {checkin.courseName ? <span>课程：{checkin.courseName}</span> : null}
                  </>
                )}
              />
            )
          })}
        </div>
      )}
      {checkins.length > 0 && error && <p role="alert">{error}</p>}
      {hasMore && <button type="button" disabled={loading} onClick={() => void more()}>{loading ? '加载中…' : '加载更多打卡'}</button>}
    </ProductPage>
  )
}

export default StudentCheckins
