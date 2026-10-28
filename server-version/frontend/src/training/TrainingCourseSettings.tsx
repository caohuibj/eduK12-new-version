import '../pages/admin/admin-training.css'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Users, BookOpen, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import './training-course-settings.css'
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

  return <section className="training-course-admin" aria-label="课程管理设置">
    {feedback}
    <section className="training-admin-roster" aria-label="学员管理">
      <div className="training-admin-roster-heading"><span className="training-admin-icon"><Users size={22} aria-hidden="true" /></span><div><h2>学员管理</h2><p>查看学员名单、处理报名与维护学员账号。</p></div></div>
      <Link className="training-action" to={'/courses/' + encodeURIComponent(course.id) + '/students'}>管理学员<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    <div className="training-admin-grid">
      <section className="training-admin-card" aria-labelledby="training-admin-info-title">
        <header className="training-admin-card-heading"><BookOpen size={19} aria-hidden="true" /><div><h2 id="training-admin-info-title">课程信息</h2><p>名称和介绍将展示在学员的课程页面。</p></div></header>
        <form onSubmit={event => void updateDetails(event)} className="training-admin-form">
          <div><label htmlFor="training-settings-name">课程名称</label><input id="training-settings-name" value={title} maxLength={200}
            disabled={closed || busy} onChange={event => setTitle(event.target.value)} required /></div>
          <div><label htmlFor="training-settings-description">课程介绍</label><textarea id="training-settings-description" rows={6} maxLength={2000}
            disabled={closed || busy} value={description} placeholder="介绍课程目标、学习内容与参与方式。"
            onChange={event => setDescription(event.target.value)} /><p className="training-admin-character-count">{description.length} / 2000</p></div>
          <div className="training-admin-save"><span>{closed ? '课程已结束，信息仅供查看。' : '修改后点击保存，更新课程信息。'}</span><button type="submit" className="training-action"
            disabled={busy || closed || !title.trim() || (title === course.title && description === (course.description || ''))}>
            {busy ? '处理中…' : '保存课程信息'}
          </button></div>
        </form>
      </section>
      <section className="training-admin-card training-admin-enrollment" aria-labelledby="training-admin-enrollment-title">
        <header className="training-admin-card-heading"><UserPlus size={19} aria-hidden="true" /><div><h2 id="training-admin-enrollment-title">报名与课程码</h2><p>控制新学员加入课程的方式。</p></div></header>
        <div className="training-admin-enrollment-state"><span>报名状态</span><strong className={closed || !course.isRecruiting ? 'is-paused' : ''}>{closed ? '已结束报名' : course.isRecruiting ? '接受报名' : '已暂停报名'}</strong></div>
        {closed ? <p className="training-admin-note">课程已结束，不再接受新报名；历史任务和结果仍按原有权限查看。</p> : <>
          <p className="training-admin-note">{course.isRecruiting ? '新学员可通过当前课程码申请加入。暂停报名不影响已加入的学员。' : '新学员暂时无法通过课程码加入；已加入的学员可继续学习。'}</p>
          <button type="button" className="training-action training-action--quiet" disabled={busy} onClick={() => void execute(course.isRecruiting ? 'stop-recruiting' : 'resume-recruiting')}>{course.isRecruiting ? '暂停报名' : '恢复报名'}</button>
          <div className="training-admin-code-maintenance"><h3>课程码维护</h3><p>需要更换课程码时使用。轮换后原码失效，已加入的学员不受影响。</p><button type="button" disabled={busy} onClick={() => void execute('rotate-code')}>轮换课程码<ArrowRight size={14} aria-hidden="true" /></button></div>
        </>}
      </section>
    </div>
    {!closed && <section className="training-admin-end" aria-label="课程结束设置"><div><h2>结束课程</h2><p>结束后停止接收新学员，保留课程内容与历史记录。</p></div><button type="button" disabled={busy} onClick={() => void execute('end')}>结束课程</button></section>}
  </section>
}
