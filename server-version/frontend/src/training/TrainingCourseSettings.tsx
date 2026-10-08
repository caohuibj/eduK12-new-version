import { useEffect, useState, type FormEvent } from 'react'
import { Settings2 } from 'lucide-react'
import apiClient from '../api/client'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import type { Course } from '../types'

/** Low-frequency course administration lives behind one discoverable section,
 * not alongside the three day-to-day teaching task categories. */
export default function TrainingCourseSettings({
  course,
  onUpdated,
}: {
  course: Course
  onUpdated: () => void
}) {
  const { feedback, confirm, success, error: showError } = useStaffFeedback()
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description || '')
  const [busy, setBusy] = useState(false)
  const closed = course.status === 'COMPLETED'

  useEffect(() => {
    setTitle(course.title)
    setDescription(course.description || '')
  }, [course.id, course.title, course.description])

  async function updateDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || closed || !title.trim()) return
    setBusy(true)
    try {
      const result = await apiClient.put('/courses/' + encodeURIComponent(course.id), {
        title: title.trim(),
        description: description.trim(),
      })
      if (result.code !== 0) throw new Error(result.message || '保存课程设置失败')
      success('课程信息已更新')
      onUpdated()
    } catch (cause) {
      showError('保存失败', cause instanceof Error ? cause.message : '请重试')
    } finally { setBusy(false) }
  }

  async function execute(operation: 'rotate-code' | 'stop-recruiting' | 'resume-recruiting' | 'end') {
    if (busy || closed) return
    const actions = {
      'rotate-code': {
        title: '轮换课程码？',
        body: '旧课程码会立即失效。已经加入课程的学员不受影响，请及时将新课程码发给待报名学员。',
        success: '课程码已轮换',
      },
      'stop-recruiting': {
        title: '暂停课程报名？',
        body: '暂停后，新学员不能再使用课程码加入。已加入的学员仍可继续学习。',
        success: '已暂停招募',
      },
      'resume-recruiting': {
        title: '恢复课程报名？',
        body: '确认后，学员可以重新使用当前课程码申请加入。',
        success: '已恢复招募',
      },
      end: {
        title: '确定结束课程？',
        body: '结束课程后将不能再招收新学员。现有课程内容与作答历史保留，结束操作不能通过本页面撤销。',
        success: '课程已结束',
      },
    } as const
    const item = actions[operation]
    if (!await confirm({
      title: item.title, body: item.body,
      confirmLabel: operation === 'end' ? '确认结束课程' : '确认',
      danger: operation === 'end',
    })) return
    setBusy(true)
    try {
      const response = await apiClient.post('/courses/' + encodeURIComponent(course.id) + '/' + operation, {})
      if (response.code !== 0) throw new Error(response.message || '课程设置操作失败')
      success(item.success)
      onUpdated()
    } catch (cause) {
      showError('课程设置失败', cause instanceof Error ? cause.message : '请重试')
    } finally { setBusy(false) }
  }

  return <div className="training-course-settings-wrap">
    {feedback}
    <details className="training-course-settings">
      <summary><Settings2 size={18} aria-hidden="true" />课程设置 <span>名称、课程码与招募</span></summary>
      <div className="training-course-settings-body">
        <form onSubmit={event => void updateDetails(event)} className="training-settings-form">
          <label htmlFor="training-settings-name">课程名称</label>
          <input id="training-settings-name" value={title} maxLength={200}
            disabled={closed || busy} onChange={event => setTitle(event.target.value)} required />
          <label htmlFor="training-settings-description">课程介绍</label>
          <textarea id="training-settings-description" rows={3} maxLength={2000}
            disabled={closed || busy} value={description}
            onChange={event => setDescription(event.target.value)} />
          <button type="submit" className="training-action training-action--quiet"
            disabled={busy || closed || !title.trim() || (title === course.title && description === (course.description || ''))}>
            保存课程信息
          </button>
        </form>
        <div className="training-settings-actions" aria-label="课程招募与结束">
          {closed ? <p>课程已结束，不再接受新报名；历史任务和结果仍按原有权限查看。</p> : <>
            <p>招募状态：{course.isRecruiting ? '接受报名' : '已暂停报名'}</p>
            <button type="button" disabled={busy} onClick={() => void execute('rotate-code')}>轮换课程码</button>
            {course.isRecruiting
              ? <button type="button" disabled={busy} onClick={() => void execute('stop-recruiting')}>暂停报名</button>
              : <button type="button" disabled={busy} onClick={() => void execute('resume-recruiting')}>恢复报名</button>}
            <button type="button" disabled={busy} className="training-danger-action" onClick={() => void execute('end')}>结束课程</button>
          </>}
        </div>
      </div>
    </details>
  </div>
}
