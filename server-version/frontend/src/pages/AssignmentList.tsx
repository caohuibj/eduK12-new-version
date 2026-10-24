import TrainingCardDescription from '../training/TrainingCardDescription'
import { trainingCourseContext } from '../training/courseNavigation'
import '../training/training-assignment-workspace.css'
import { CatalogFilters, CatalogPagination } from '../training/TrainingCatalogControls'
import { useCatalogQuery } from '../training/useCatalogQuery'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import ModalSurface from '../components/shared-ui/ModalSurface'
import TrainingCourseEditorTabs from '../training/TrainingCourseEditorTabs'
import '../training/training-task-editor.css'
import TrainingTaskReusePicker from '../training/TrainingTaskReusePicker'
import { assignmentReuseContent } from '../training/taskReuse'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2, ClipboardList, FileText, Clock, Video, Image as ImageIcon, CheckSquare, Square, MessageSquare, Users, X } from 'lucide-react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { isTrainingHost } from '../training/context'
import { resolveTrainingCoursePrefill } from '../training/resolveCoursePrefill'
import { useTaskExport } from '../hooks/useTaskExport'
import QuestionEditor, { Question } from '../components/QuestionEditor'
import RichTextEditor from '../components/RichTextEditor'
import MediaSelector from '../components/DeferredMediaSelector'
import type { MediaItem } from '../components/MediaSelector'
import TagInput from '../components/TagInput'
import TagBadge from '../components/TagBadge'
import {} from '../utils/sanitize'
import { normalizeImageUrl, handleImageError } from '../utils/mediaUtils'
import { buildAssignmentAttachmentUpdateFields } from '../utils/attachmentUpdate'
import type { Assignment, Course } from '../types'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'
import { dateTimeInputValue, deadlineToIso, formatLocalDateTime, localTimeZoneLabel } from '../utils/dateTime'
import { formatAssignmentAnswer, assignmentAnswerHeading } from '../utils/answerLabels'
import MoreActions from '../components/staff-ui/MoreActions'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

interface VideoItem {
  type: 'library' | 'external' | 'upload'
  id?: string
  url: string
  title: string
  thumbnail?: string
  source?: string
}

interface ImageItem {
  url: string
  name: string
}

interface DocumentItem {
  id: string
  url: string
  title: string
  fileName?: string
}

interface AssignmentFormData {
  courseId: string
  title: string
  description: string
  content: string
  deadline: string
  questions: Question[]
  videos: VideoItem[]
  images: ImageItem[]
  documents: DocumentItem[]
  tags: string[]
}

interface ReviewSnapshot { selectionId: string; chunks: string[]; count: number; expiresAt: string }

interface Submission {
  revision: number
  id: string
  studentId: string
  student: {
    id: string
    username: string
    nickname: string
    avatarUrl?: string
  }
  content?: string
  answers?: Record<string, any>
  comment?: string
  status: 'DRAFT' | 'SUBMITTED' | 'GRADED'
  submittedAt: string
  reviewedAt?: string
}

// A changed deep-link/auth identity must never display the previous record or editor.
type AssignmentListProps = { embeddedCourse?: Course }
const AssignmentList: React.FC<AssignmentListProps> = ({ embeddedCourse }) => {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const context = trainingCourseContext(location.pathname, location.search)
  if (!embeddedCourse && isTrainingHost() && user?.role === 'TEACHER' && context) {
    const next = new URLSearchParams({ section: 'assignments' })
    for (const key of ['search','tags','from','to','dateField','page','pageSize']) if (params.has(key)) next.set('assignments_'+key, params.get(key)!)
    for (const key of ['create','reuse']) if (params.get(key) === 'true') next.set(key, 'true')
    if (params.get('id')) next.set('assignmentId', params.get('id')!)
    return <Navigate replace to={'/courses/'+encodeURIComponent(context.courseId)+'/detail?'+next.toString()}/>
  }
  return <AssignmentListContent embeddedCourse={embeddedCourse} key={JSON.stringify([user?.id, user?.role, embeddedCourse?.id || params.get('courseId'), params.get(embeddedCourse ? 'assignmentId' : 'id')])} />
}

const AssignmentListContent: React.FC<AssignmentListProps> = ({ embeddedCourse }) => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCourseId = embeddedCourse?.id || searchParams.get('courseId')
  const [showReuse, setShowReuse] = useState(false)
  const canReuse = isTrainingHost() && user?.role === 'TEACHER'
  const focusId = searchParams.get(embeddedCourse ? 'assignmentId' : 'id')
  const { feedback, confirm, success, error: showError, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const { exporting, exportTask } = useTaskExport(showMessage)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Course[]>(embeddedCourse ? [embeddedCourse] : [])
  const coursesLoaded = useRef(Boolean(embeddedCourse))
  const coursesPending = useRef(false)
  const [coursesError, setCoursesError] = useState<string | null>(null)
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const mounted = useRef(true)
  const loadSequence = useRef(0)
  const detailSequence = useRef(0)
  const [openingDetail,setOpeningDetail]=useState(false)
  const catalog = useCatalogQuery(embeddedCourse ? 'assignments_' : '')
  const [filterRevision,setFilterRevision]=useState(0)
  const [total, setTotal] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [formData, setFormData] = useState<AssignmentFormData>({
    courseId: '',
    title: '',
    description: '',
    content: '',
    deadline: '',
    questions: [],
    videos: [],
    images: [],
    documents: [],
    tags: [],
  })
  const [showMediaSelector, setShowMediaSelector] = useState(false)
  const [mediaSelectorType, setMediaSelectorType] = useState<'video' | 'image' | 'document'>('video')
  
  // 提交列表弹窗状态
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionCounts, setSubmissionCounts] = useState({ total: 0, graded: 0, ungraded: 0 })
  const [submissionCursor, setSubmissionCursor] = useState<string | null>(null)
  const [submissionHistory, setSubmissionHistory] = useState<(string | null)[]>([null])
  const [nextSubmissionCursor, setNextSubmissionCursor] = useState<string | null>(null)
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null)
  const [selectionLoading, setSelectionLoading] = useState(false)
  const reviewComment = useRef<string | null>(null)
  const reviewProgress = useRef({ next: 0, applied: 0, skipped: 0 })
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const submissionsSequence = useRef(0)
  const submissionsPending = useRef<{ id: string; sequence: number } | null>(null)
  const submissionsTask = useRef<string | null>(null)
  const ungradedSubmissions = useMemo(() => submissions.filter(submission => submission.status !== 'GRADED'), [submissions])
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set())
  const [batchComment, setBatchComment] = useState('你的练习质量很棒，再接再厉！')
  const [isBatchGrading, setIsBatchGrading] = useState(false)
  const [showBatchGradeModal, setShowBatchGradeModal] = useState(false)

  useEffect(() => {
    mounted.current = true
    setSelectionLoading(false)
    setIsBatchGrading(false)
    setSubmissionsLoading(false)
    // Invalidate the live request epoch, rather than capturing its mount-time value.
    const invalidateSubmissions = () => {
      submissionsSequence.current++
      submissionsPending.current = null
    }
    return () => { mounted.current = false; loadSequence.current++; invalidateSubmissions() }
  }, [])

  // Course choices are authoring data, not a prerequisite for reviewing/exporting tasks.
  // Preserve eager authorization/prefill for existing course-context deep links.
  const needsCourses = Boolean(requestedCourseId || showModal || showReuse)
  useEffect(() => {
    if (needsCourses) void fetchCourses()
  }, [needsCourses])

  useEffect(() => { void fetchAssignments(); return () => { loadSequence.current++ } }, [catalog.params, focusId, requestedCourseId])

  useEffect(() => {
    if (loading || !focusId) return
    const element = document.getElementById(`assignment-record-${focusId}`)
    if (!element) return
    element.scrollIntoView({ block: 'center' })
    element.focus()
  }, [loading, focusId])

  useEffect(() => {
    if (searchParams.get('create') !== 'true' || !courses.some(course => course.id === requestedCourseId)) return
    setFormData(current => ({ ...current, courseId: requestedCourseId! }))
    setShowModal(true)
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }, [courses, requestedCourseId, searchParams, setSearchParams])

  useEffect(() => {
    if (!canReuse || searchParams.get('reuse') !== 'true' || !courses.some(course => course.id === requestedCourseId)) return
    setShowReuse(true)
    const next = new URLSearchParams(searchParams)
    next.delete('reuse')
    setSearchParams(next, { replace: true })
  }, [canReuse, courses, requestedCourseId, searchParams, setSearchParams])

  const fetchAssignments = async () => {
    if (!mounted.current) return
    const request = ++loadSequence.current
    setLoading(true)
    setLoadError(null)
    setAssignments([])
    try {
      if (focusId) {
        // Resolve the authorized record directly, including records beyond list page 1.
        const detailPath = `/assignments/${encodeURIComponent(focusId)}` + (requestedCourseId ? `?courseId=${encodeURIComponent(requestedCourseId)}` : '')
        const response = await apiClient.get<Assignment>(detailPath)
        if (request !== loadSequence.current) return
        if (response.code !== 0 || !response.data) throw new Error(response.message || '无法读取练习')
        const record = response.data
        if (record.id !== focusId || !record.courseId
          || (requestedCourseId && record.courseId !== requestedCourseId)
          || record.course?.id !== record.courseId
          || (user?.role === 'TEACHER' && record.course?.creatorId !== user.id)) {
          throw new Error('无法管理此课程的练习')
        }
        setAssignments([record])
      } else {
        const path = embeddedCourse ? '/assignments?view=summary&courseId='+encodeURIComponent(embeddedCourse.id)+'&'+catalog.params : '/assignments?view=summary&' + catalog.params + (requestedCourseId ? `&courseId=${encodeURIComponent(requestedCourseId)}` : '')
        const response = await apiClient.get<{ list: Assignment[]; total: number }>(path)
        if (request !== loadSequence.current) return
        if (response.code !== 0) throw new Error(response.message || '获取练习列表失败')
        setAssignments(response.data.list)
        setTotal(response.data.total ?? response.data.list.length)
      }
    } catch (error) {
      if (request !== loadSequence.current) return
      setAssignments([])
      setLoadError(error instanceof Error ? error.message : '获取练习列表失败')
    } finally {
      if (request === loadSequence.current) setLoading(false)
    }
  }

  const fetchCourses = async () => {
    if (coursesLoaded.current || coursesPending.current) return
    coursesPending.current = true
    setCoursesLoading(true)
    setCoursesError(null)
    try {
      const response = await apiClient.get<{ list: Course[] }>('/courses')
      if (response.code !== 0) throw new Error(response.message || '获取课程列表失败')
      if (response.code === 0) {
        const list = response.data.list
        const appended = (searchParams.get('create') === 'true' || searchParams.get('reuse') === 'true')
          ? await resolveTrainingCoursePrefill({
            courseId: requestedCourseId,
            userId: user?.id,
            knownIds: list.map(course => course.id),
          }) : null
        if (mounted.current) {
          coursesLoaded.current = true
          setCourses(appended ? [...list, appended] : list)
        }
      }
    } catch (error) {
      if (mounted.current) setCoursesError(error instanceof Error ? error.message : '获取课程列表失败')
    } finally {
      coursesPending.current = false
      if (mounted.current) setCoursesLoading(false)
    }
  }


  const fetchSubmissions = async (assignmentId: string, cursor: string | null = null, history: (string | null)[] = [null]) => {
    if (!mounted.current || submissionsTask.current !== assignmentId || submissionsPending.current?.id === assignmentId) return
    const sequence = ++submissionsSequence.current
    submissionsPending.current = { id: assignmentId, sequence }
    setSubmissionsLoading(true)
    setSubmissionCursor(cursor)
    setSubmissionHistory(history)
    setSubmissionsError(null)
    try {
      const response = await apiClient.get<{ list: Submission[]; total: number; gradedCount: number; ungradedCount: number; nextCursor: string | null }>(`/assignments/${assignmentId}/submissions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
      if (!mounted.current || sequence !== submissionsSequence.current) return
      if (response.code !== 0) throw new Error(response.message || '获取提交列表失败')
      setSubmissions(response.data.list)
      setSubmissionCounts({ total: response.data.total, graded: response.data.gradedCount, ungraded: response.data.ungradedCount })
      setSubmissionCursor(cursor)
      setSubmissionHistory(history)
      setNextSubmissionCursor(response.data.nextCursor)
      setReviewSnapshot(null)
      reviewProgress.current = { next: 0, applied: 0, skipped: 0 }
      reviewComment.current = null
      // Selection is explicitly limited to this page until the teacher chooses all ungraded.
      const ungraded = response.data.list.filter(submission => submission.status !== 'GRADED')
      setSelectedSubmissions(new Set(ungraded.map(submission => submission.id)))
    } catch (error) {
      if (mounted.current && sequence === submissionsSequence.current) {
        setSubmissionsError(error instanceof Error ? error.message : '获取提交列表失败')
      }
    } finally {
      if (mounted.current && sequence === submissionsSequence.current) {
        submissionsPending.current = null
        setSubmissionsLoading(false)
      }
    }
  }

  // A closed/replaced dialog invalidates its response, including an earlier read of the same task.
  const openSubmissionsModal = (assignment: Assignment) => {
    if (submissionsTask.current !== assignment.id) {
      submissionsSequence.current++
      submissionsPending.current = null
      setSubmissions([])
      setSubmissionCounts({ total: 0, graded: 0, ungraded: 0 })
      setSelectedSubmissions(new Set())
    }
    submissionsTask.current = assignment.id
    setSelectedAssignment(assignment)
    setShowSubmissionsModal(true)
    void fetchSubmissions(assignment.id)
  }

  const selectAllUngraded = async () => {
    if (!selectedAssignment || selectionLoading || isBatchGrading) return
    const sequence = submissionsSequence.current
    setSelectionLoading(true)
    try {
      const response = await apiClient.post<ReviewSnapshot>(`/assignments/${selectedAssignment.id}/review-selection`, { scope: 'all-ungraded' })
      if (!mounted.current || sequence !== submissionsSequence.current) return
      if (response.code !== 0) throw new Error(response.message || '选择失败')
      setReviewSnapshot(response.data)
      reviewProgress.current = { next: 0, applied: 0, skipped: 0 }
      reviewComment.current = null
    } catch (error) {
      if (mounted.current && sequence === submissionsSequence.current) showMessage(error instanceof Error ? error.message : '选择失败，请重试')
    } finally {
      if (mounted.current && sequence === submissionsSequence.current) setSelectionLoading(false)
    }
  }

  // Retry resumes the failed chunk. A possibly committed retry is skipped, never re-applied.
  const handleBatchGrade = async () => {
    if (!selectedAssignment || isBatchGrading || selectionLoading) return
    if (!(reviewSnapshot?.count ?? selectedSubmissions.size)) return showMessage('请至少选择一份练习')
    if (!batchComment.trim()) return showMessage('请输入评语')
    const sequence = submissionsSequence.current
    const assignmentId = selectedAssignment.id
    setIsBatchGrading(true)
    try {
      let snapshot = reviewSnapshot
      if (!snapshot) {
        const response = await apiClient.post<ReviewSnapshot>(`/assignments/${assignmentId}/review-selection`, {
          scope: 'page', items: submissions.filter(item => selectedSubmissions.has(item.id)).map(({ id, revision }) => ({ id, revision })),
        })
        if (response.code !== 0) throw new Error(response.message || '选择失败')
        snapshot = response.data
        if (!mounted.current || sequence !== submissionsSequence.current) return
        setReviewSnapshot(snapshot)
        reviewProgress.current.skipped += selectedSubmissions.size - snapshot.count
      }
      reviewComment.current ??= batchComment.trim()
      while (reviewProgress.current.next < snapshot.chunks.length) {
        const response = await apiClient.post<{ gradedCount: number; skippedCount: number }>(`/assignments/${assignmentId}/batch-grade`, {
          selectionToken: snapshot.chunks[reviewProgress.current.next], comment: reviewComment.current,
        })
        if (!mounted.current || sequence !== submissionsSequence.current) return
        if (response.code !== 0) throw new Error(response.message || '批改失败')
        reviewProgress.current.applied += response.data.gradedCount
        reviewProgress.current.skipped += response.data.skippedCount
        reviewProgress.current.next++
      }
      const { applied, skipped } = reviewProgress.current
      showMessage(`本次确认批复 ${applied} 份；${skipped} 份已变化或已处理，未重复批改。请以刷新后的列表为准。`)
      setShowBatchGradeModal(false)
      void fetchSubmissions(assignmentId)
    } catch (error) {
      if (mounted.current && sequence === submissionsSequence.current) showMessage(`${error instanceof Error ? error.message : '批量批复失败'}。已确认 ${reviewProgress.current.applied} 份，可重试未完成批次；网络异常的批次结果请刷新确认。`)
    } finally {
      if (mounted.current && sequence === submissionsSequence.current) setIsBatchGrading(false)
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    setReviewSnapshot(null)
    reviewProgress.current = { next: 0, applied: 0, skipped: 0 }
    reviewComment.current = null
    if (selectedSubmissions.size === ungradedSubmissions.length) {
      setSelectedSubmissions(new Set())
    } else {
      setSelectedSubmissions(new Set(ungradedSubmissions.map(s => s.id)))
    }
  }

  // 单个选择/取消选择
  const toggleSelectSubmission = (submissionId: string) => {
    setReviewSnapshot(null)
    reviewProgress.current = { next: 0, applied: 0, skipped: 0 }
    reviewComment.current = null
    const newSet = new Set(selectedSubmissions)
    if (newSet.has(submissionId)) {
      newSet.delete(submissionId)
    } else {
      newSet.add(submissionId)
    }
    setSelectedSubmissions(newSet)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editorGuard.begin()) return
    try {
      const data = {
        courseId: formData.courseId,
        title: formData.title,
        description: formData.description,
        content: formData.content,
        deadline: deadlineToIso(formData.deadline),
        questions: formData.questions.length > 0 ? formData.questions : undefined,
        videos: formData.videos.length > 0 ? formData.videos : undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        documents: formData.documents.length > 0 ? formData.documents : undefined,
        tags: formData.tags,
      }
      const response = await apiClient.post('/assignments', data)
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      if (response.code === 0) {
        setShowModal(false)
        resetForm()
        setFilterRevision(value=>value+1)
        // A record deep link reads only that record. Leave it after creating
        // so the teacher can see the new assignment in its course list.
        const prefix = embeddedCourse ? 'assignments_' : ''
        if (focusId || requestedCourseId !== data.courseId || ['search','tags','from','to','page'].some(key=>searchParams.has(prefix+key))) {
          const next = new URLSearchParams(searchParams)
          next.delete(embeddedCourse ? 'assignmentId' : 'id')
          next.delete('create')
          for (const key of ['search','tags','from','to','page']) next.delete(prefix+key)
          if (!embeddedCourse) next.set('courseId', data.courseId)
          setSearchParams(next, { replace: true })
        } else {
          void fetchAssignments()
        }
      }
    } catch (error: any) {
      editorGuard.fail(String(error.message || '创建失败'))
    } finally {
      editorGuard.finish()
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAssignment) return

    if (!editorGuard.begin()) return
    try {
      const data = {
        title: formData.title,
        description: formData.description,
        content: formData.content,
        deadline: deadlineToIso(formData.deadline),
        ...buildAssignmentAttachmentUpdateFields(formData),
        tags: formData.tags,
      }
      const response = await apiClient.put(`/assignments/${editingAssignment.id}`, data)
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      if (response.code === 0) {
        setShowModal(false)
        setEditingAssignment(null)
        resetForm()
        fetchAssignments()
      }
    } catch (error: any) {
      editorGuard.fail(String(error.message || '更新失败'))
    } finally {
      editorGuard.finish()
    }
  }

  const handleDelete = async (assignment: Assignment) => {
    if (!(await confirm({ title: `删除练习「${assignment.title}」？`, body: '删除后将无法继续提交；已有业务约束仍由服务器检查。', confirmLabel: '删除练习', danger: true }))) return
    try {
      const response = await apiClient.delete(`/assignments/${assignment.id}`)
      if (response.code === 0) {
        success('练习已删除')
        fetchAssignments()
      }
    } catch (error: any) {
      showError('删除练习失败', error.message || '请稍后重试')
    }
  }

  const handleClone = async (assignment: Assignment) => {
    if (!(await confirm({ title: `复制练习「${assignment.title}」？`, body: '副本会清空截止时间和作答数据，原练习不会改变。', confirmLabel: '复制练习' }))) return
    try {
      const full = await loadFullRecord(assignment)
      if (!full) return
      assignment = full
      const response = await apiClient.post(`/assignments`, {
        courseId: assignment.courseId,
        title: `${assignment.title} (复制)`,
        description: assignment.description,
        content: assignment.content,
        questions: assignment.questions,
        videos: assignment.videos,
        images: assignment.images,
        documents: assignment.documents,
      })
      if (response.code === 0) {
        success('练习已复制')
        fetchAssignments()
      }
    } catch (error: any) {
      showError('复制练习失败', error.message || '请稍后重试')
    }
  }

  const handleExport = (assignment: Assignment) => exportTask(assignment.id,
    `/api/assignments/${assignment.id}/export`, `${assignment.title}_提交数据.xlsx`)

  const openCreateModal = () => {
    resetForm()
    if (isTrainingHost() && courses.some(course => course.id === requestedCourseId)) setFormData(current => ({ ...current, courseId: requestedCourseId! }))
    setEditingAssignment(null)
    setShowModal(true)
  }

  const loadFullRecord = async (row: Assignment): Promise<Assignment | null> => {
    const token=++detailSequence.current
    if (!(row as Assignment & {summary?:boolean}).summary) return mounted.current ? row : null
    setOpeningDetail(true)
    const sequence = loadSequence.current
    try {
      const response = await apiClient.get<Assignment>(`/assignments/${encodeURIComponent(row.id)}?courseId=${encodeURIComponent(row.courseId)}`)
      if (!mounted.current || sequence !== loadSequence.current || token !== detailSequence.current) return null
      const record = response.data
      if (response.code !== 0 || !record || record.id !== row.id || record.courseId !== row.courseId || record.course?.id !== row.courseId || (user?.role === 'TEACHER' && record.course.creatorId !== user.id)) throw new Error(response.message || '无法读取完整内容')
      return record
    } catch (cause) { if(mounted.current && token===detailSequence.current) showError('读取失败', cause instanceof Error ? cause.message : '请重试'); return null }
    finally { if(mounted.current && token===detailSequence.current)setOpeningDetail(false) }
  }

  const openEditModal = async (row: Assignment) => {
    const assignment = await loadFullRecord(row)
    if (!assignment) return
    setEditingAssignment(assignment)
    setFormData({
      courseId: assignment.courseId,
      title: assignment.title,
      description: assignment.description || '',
      content: assignment.content || '',
      deadline: assignment.deadline ? dateTimeInputValue(assignment.deadline) : '',
      questions: (assignment.questions as Question[]) || [],
      videos: (assignment.videos as VideoItem[]) || [],
      images: (assignment.images as ImageItem[]) || [],
      documents: (assignment.documents as DocumentItem[]) || [],
      tags: assignment.tags || [],
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      courseId: '',
      title: '',
      description: '',
      content: '',
      deadline: '',
      questions: [],
      videos: [],
      images: [],
      documents: [],
      tags: [],
    })
  }

  const handleAddMedia = (type: 'video' | 'image' | 'document') => {
    setMediaSelectorType(type)
    setShowMediaSelector(true)
  }

  const handleMediaSelect = (item: MediaItem) => {
    if (mediaSelectorType === 'video') {
      setFormData({
        ...formData,
        videos: [...formData.videos, item as VideoItem],
      })
    } else if (mediaSelectorType === 'image') {
      setFormData({
        ...formData,
        images: [...formData.images, item as unknown as ImageItem],
      })
    } else if (mediaSelectorType === 'document') {
      setFormData({
        ...formData,
        documents: [...formData.documents, item as DocumentItem],
      })
    }
    setShowMediaSelector(false)
  }

  const removeVideo = (index: number) => {
    setFormData({
      ...formData,
      videos: formData.videos.filter((_, i) => i !== index),
    })
  }

  const removeImage = (index: number) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    })
  }

  const removeDocument = (index: number) => {
    setFormData({
      ...formData,
      documents: formData.documents.filter((_, i) => i !== index),
    })
  }

  const filteredAssignments = assignments

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return '无截止时间'
    const date = new Date(deadline)
    const now = new Date()
    const isOverdue = date < now
    return (
      <span className={isOverdue ? 'text-red-500' : 'text-gray-500'}>
        <Clock className="w-3 h-3 inline mr-1" />
        {formatLocalDateTime(deadline, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {isOverdue && ' (已截止)'}
      </span>
    )
  }

  const closeEditor = () => {
    setShowModal(false)
    setEditingAssignment(null)
    resetForm()
  }

  const closeSubmissions = () => {
    if (isBatchGrading) return
    setSelectionLoading(false)
    setReviewSnapshot(null)
    setShowBatchGradeModal(false)
    submissionsTask.current = null
    submissionsSequence.current++
    submissionsPending.current = null
    setSubmissionsLoading(false)
    setSubmissionsError(null)
    setShowSubmissionsModal(false)
    setSelectedAssignment(null)
    setSubmissions([])
    setSelectedSubmissions(new Set())
  }

  const closeBatchGrade = () => {
    if (!isBatchGrading) setShowBatchGradeModal(false)
  }

  const editorGuard = useEditorGuard({ open: showModal, value: formData, onClose: closeEditor })

  const PageContainer = embeddedCourse ? 'section' : ProductPage
  return (
    <PageContainer {...(embeddedCourse ? { 'aria-label':'课程练习管理' } : { width: 'management' as const })} className={embeddedCourse ? 'training-assignment-workspace' : 'space-y-6'}>
      {!embeddedCourse && <PageHeader title="练习管理" description="集中查看课程练习、提交进度和截止时间。" actions={<><ProductButton variant="primary" onClick={openCreateModal}><Plus className="w-4 h-4" aria-hidden="true" />布置练习</ProductButton>{canReuse && <ProductButton onClick={() => setShowReuse(true)}>复用练习</ProductButton>}</>} />}
      {embeddedCourse && <div className="training-assignment-toolbar"><div><ProductButton variant="primary" onClick={openCreateModal}><Plus size={17} aria-hidden="true"/>发布练习</ProductButton>{canReuse && <ProductButton onClick={() => setShowReuse(true)}>复用练习</ProductButton>}</div><p>在当前课程内编辑、查看提交和导出数据。</p></div>}
      {embeddedCourse && focusId && <div className="training-assignment-focused"><span>已定位到这份练习</span><ProductButton onClick={() => { const next=new URLSearchParams(searchParams);next.delete('assignmentId');setSearchParams(next,{replace:true}) }}>显示全部练习</ProductButton></div>}
      {feedback}
      {!showModal && !showReuse && coursesLoading && <p role="status">正在读取可选课程…</p>}
      {!showModal && !showReuse && coursesError && <p role="alert">{coursesError}<ProductButton onClick={() => void fetchCourses()}>重试课程列表</ProductButton></p>}
      {openingDetail && <p role="status">正在读取练习完整内容…</p>}
      {!embeddedCourse && !focusId && <CatalogFilters key={filterRevision+catalog.stateKey} selection={catalog.selection} onApply={catalog.apply} deadline label="练习"/>}
      {loading ? <ProductStatus kind="pending" title="正在加载练习">正在读取练习和提交概况。</ProductStatus>
      : loadError ? <ProductStatus kind="error" title="练习列表加载失败" actions={<ProductButton onClick={() => void fetchAssignments()}>重试</ProductButton>}>{loadError}</ProductStatus>
      : filteredAssignments.length === 0 ? <ProductStatus kind="info" title="暂无匹配练习">可以调整筛选条件，或布置第一份练习。</ProductStatus>
      : embeddedCourse ? <div className="training-item-list training-course-task-grid">{filteredAssignments.map(assignment => <article id={`assignment-record-${assignment.id}`} tabIndex={-1} key={assignment.id} className="training-task-item training-course-task-card" aria-labelledby={'assignment-title-'+assignment.id}>
        <div className="training-course-task-card-top"><span>练习</span>{assignment.status && <span className="training-course-task-status">{assignment.status==='PUBLISHED'?'已发布':'草稿'}</span>}</div>
        <h2 id={'assignment-title-'+assignment.id}><button className="training-assignment-title" onClick={()=>void openEditModal(assignment)}>{assignment.title}</button></h2>
        {assignment.description && <TrainingCardDescription id={'assignment-description-'+assignment.id} description={assignment.description}/>}
        {assignment.tags?.length ? <div className="staff-inline-tags">{assignment.tags.slice(0,3).map((tag,index)=><TagBadge key={index} tag={tag}/>)}</div> : null}
        <dl className="training-assignment-facts"><div><dt>截止时间</dt><dd>{formatDeadline(assignment.deadline)}</dd></div><div><dt>提交数量</dt><dd>{assignment._count?.submissions || 0} 份</dd></div></dl>
        <footer className="training-assignment-card-actions"><ProductButton variant="primary" onClick={()=>openSubmissionsModal(assignment)}>查看提交</ProductButton><ProductButton onClick={()=>void openEditModal(assignment)}>编辑练习</ProductButton><ProductButton disabled={exporting.has(assignment.id)} onClick={()=>void handleExport(assignment)}>{exporting.has(assignment.id)?'导出中…':'导出提交'}</ProductButton><MoreActions label={`${assignment.title} 的更多操作`}><button type="button" onClick={()=>void handleClone(assignment)}>复制练习</button><button type="button" className="staff-danger-action" onClick={()=>void handleDelete(assignment)}>删除练习</button></MoreActions></footer>
      </article>)}</div>
      : <div className="staff-table-container staff-record-table"><table className="staff-table" aria-label="练习记录"><thead><tr><th scope="col">练习</th><th scope="col">课程</th><th scope="col">截止时间</th><th scope="col">提交</th><th scope="col">题目</th><th scope="col" className="text-right">操作</th></tr></thead><tbody>
        {filteredAssignments.map(assignment=><tr id={`assignment-record-${assignment.id}`} tabIndex={-1} key={assignment.id} className={focusId===assignment.id?'staff-target-row':''}>
          <td><button type="button" className="staff-record-button" onClick={()=>openEditModal(assignment)}>{assignment.title}</button>{assignment.tags?.length?<div className="staff-inline-tags">{assignment.tags.slice(0,2).map((tag,index)=><TagBadge key={index} tag={tag}/>)}</div>:null}</td>
          <td className="staff-record-course" data-label="课程">{assignment.course?.title || '未知课程'}</td>
          <td data-label="截止时间">{formatDeadline(assignment.deadline)}</td>
          <td data-label="提交"><button type="button" className="staff-text-action" onClick={()=>openSubmissionsModal(assignment)}>{assignment._count?.submissions || 0} 份提交</button></td>
          <td data-label="题目">{(assignment as Assignment & {summary?:boolean}).summary ? '打开后查看' : assignment.questions?.length || 0}</td>
          <td><div className="staff-table-actions"><ProductButton onClick={()=>openSubmissionsModal(assignment)}>查看提交</ProductButton><MoreActions label={`${assignment.title} 的更多操作`}><button type="button" disabled={exporting.has(assignment.id)} onClick={()=>void handleExport(assignment)}>{exporting.has(assignment.id)?'导出中…':'导出提交'}</button><button type="button" onClick={()=>void handleClone(assignment)}>复制练习</button><button type="button" onClick={()=>openEditModal(assignment)}>编辑练习</button><button type="button" className="staff-danger-action" onClick={()=>void handleDelete(assignment)}>删除练习</button></MoreActions></div></td>
        </tr>)}
      </tbody></table></div>}
      {!focusId && <CatalogPagination selection={catalog.selection} onApply={catalog.apply} total={total} loading={loading} label="练习"/>}
      {/* Create/Edit Modal */}
      {showModal && (
        <ModalSurface open onClose={editorGuard.close} className="staff-modal-backdrop">
          <form onSubmit={editingAssignment ? handleUpdate : handleCreate} className="staff-dialog staff-dialog--wide training-task-editor" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="assignment-editor-title" aria-busy={editorGuard.busy}>
            <TrainingCourseEditorTabs courseId={formData.courseId} leave={editorGuard.leave} />
            {editorGuard.error}<fieldset disabled={editorGuard.busy} className="contents">
            <div className="staff-dialog__header">
              <div>
                <h2 id="assignment-editor-title">{editingAssignment ? '编辑练习' : isTrainingHost() ? '发布练习' : '布置练习'}</h2>
                <p className="staff-dialog__description">编写任务内容，按需添加题目和资料，再确认发布设置。</p>
              </div>
            </div>
            
            <div {...(editorGuard.busy ? { inert: '' } : {})} className="staff-dialog__body staff-form training-task-editor__body">
              <div className="training-task-editor__layout">
                <div className="training-task-editor__main">
                  <section className="training-task-editor__section" aria-label="练习内容编辑">
                    <header className="training-task-editor__section-heading"><h3>编辑内容</h3><span>标题与任务说明</span></header>
              {/* Title */}
              <div>
                <label htmlFor="AssignmentList-field-102" className="label">练习标题 *</label>
                <input id="AssignmentList-field-102"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input w-full"
                  placeholder="请输入练习标题"
                  required
                />
              </div>

              {/* Rich Text Content */}
              <div>
                <label className="label">练习内容</label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="请输入练习内容..."
                  height={isTrainingHost() ? "210px" : "150px"}
                />
              </div>

                  </section>
              <section className="training-task-editor__section" aria-label="练习题目设置">
                <header className="training-task-editor__section-heading"><h3>题目设置</h3><span>{formData.questions.length} 道题</span></header>
              {/* Questions */}
              <div>
                <QuestionEditor
                  questions={formData.questions}
                  onChange={(questions) => setFormData({ ...formData, questions })}
                />
              </div>

              </section>
                  <section className="training-task-editor__section" aria-label="练习附件资料">
                    <header className="training-task-editor__section-heading"><h3>附件与资料</h3><span>选填</span></header>
                    <div className="training-task-editor__attachments">
              {/* Videos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">视频</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('video')}
                    className="text-sm text-action hover:text-action-hover flex items-center"
                  >
                    <Video className="w-4 h-4 mr-1" />
                    添加视频
                  </button>
                </div>
                {formData.videos.length > 0 && (
                  <div className="space-y-2">
                    {formData.videos.map((video, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2">
                          <Video className="w-4 h-4 text-gray-400" />
                          <span className="text-sm truncate">{video.title}</span>
                          {video.source && (
                            <span className="text-xs text-gray-500">({({ library: '素材库', upload: '上传文件', external: '外部链接' } as Record<string, string>)[video.source || ''] || '视频附件'})</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVideo(index)}
                          aria-label={`移除视频 ${video.title}`}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">图片</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('image')}
                    className="text-sm text-action hover:text-action-hover flex items-center"
                  >
                    <ImageIcon className="w-4 h-4 mr-1" />
                    添加图片
                  </button>
                </div>
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formData.images.map((image, index) => {
                      const imageUrl = normalizeImageUrl(image.url)
                      return (
                        <div key={index} className="relative group">
                          <img
                            src={imageUrl}
                            alt={image.name}
                            className="w-full h-20 object-cover rounded"
                            onError={(e) => {
                              console.error('图片预览加载失败:', imageUrl)
                              handleImageError(e)
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                          aria-label={`移除图片 ${image.name}`}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">文档</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('document')}
                    className="text-sm text-action hover:text-action-hover flex items-center"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    添加文档
                  </button>
                </div>
                {formData.documents.length > 0 && (
                  <div className="space-y-2">
                    {formData.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-red-500" />
                          <span className="text-sm truncate">{doc.title}</span>
                          {doc.fileName && (
                            <span className="text-xs text-gray-500">({doc.fileName})</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDocument(index)}
                          aria-label={`移除文档 ${doc.title}`}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

                    </div>
                  </section>
                </div>
                <aside className="training-task-editor__settings" aria-label="练习发布设置">
                  <header className="training-task-editor__section-heading"><h3>发布设置</h3></header>
              {/* Course Selection */}
              <div>
                {coursesLoading && <p role="status">正在读取可选课程…</p>}
                {coursesError && <p role="alert">{coursesError}<ProductButton onClick={() => void fetchCourses()}>重试课程列表</ProductButton></p>}
                <label htmlFor="AssignmentList-field-101" className="label">选择课程 *</label>
                <select id="AssignmentList-field-101"
                  value={formData.courseId}
                  onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                  className="input w-full"
                  required
                  disabled={!!editingAssignment}
                >
                  <option value="">请选择课程</option>
                  {editingAssignment?.course && !courses.some(course => course.id === editingAssignment.courseId) && <option value={editingAssignment.courseId}>{editingAssignment.course.title}</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}{!isTrainingHost() && ` (课程码: ${course.courseCode})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="AssignmentList-field-103" className="label">截止时间</label>
                <input id="AssignmentList-field-103"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="input w-full"
                />
              </div>

              <p className="staff-help">截止时间按当前设备时区输入：{localTimeZoneLabel()}。</p>

              {/* Tags */}
              <div>
                <label className="label">标签</label>
                <TagInput
                  value={formData.tags}
                  onChange={(tags) => setFormData({ ...formData, tags })}
                  placeholder="输入标签后按回车添加"
                />
              </div>

                </aside>
              </div>
              {/* Actions */}
            </div>
            <div className="staff-dialog__actions"><span className="training-task-editor__footer-note">{editingAssignment ? '编辑完成后保存修改。' : '发布后，课程学员即可查看。'}</span>
              <ProductButton
                type="button"
                onClick={editorGuard.close}
              >
                取消
              </ProductButton>
              <ProductButton type="submit" variant="primary">
                {editorGuard.busy ? '保存中...' : editingAssignment ? '保存修改' : isTrainingHost() ? '发布练习' : '创建练习'}
              </ProductButton>
            </div>
            </fieldset>
          </form>
        </ModalSurface>
      )}

      {canReuse && showReuse && <TrainingTaskReusePicker kind="assignments" courses={courses} courseLoading={coursesLoading} courseError={coursesError} onRetryCourses={() => void fetchCourses()} initialCourseId={requestedCourseId} onClose={() => setShowReuse(false)} onSelect={(source, targetCourseId) => {
        setEditingAssignment(null)
        setFormData(assignmentReuseContent(source as Assignment, targetCourseId) as AssignmentFormData)
        setShowReuse(false)
        setShowModal(true)
      }} />}

      {/* Media Selector */}
      <MediaSelector
        isOpen={showMediaSelector}
        onClose={() => setShowMediaSelector(false)}
        onSelect={handleMediaSelect}
        type={mediaSelectorType}
      />

      {/* Submissions Modal */}
      {showSubmissionsModal && selectedAssignment && (
        <ModalSurface open onClose={closeSubmissions} className="staff-modal-backdrop">
          <div className="staff-dialog staff-dialog--wide" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="assignment-submissions-title">
            <div className="staff-dialog__header">
              <div>
                <h2 id="assignment-submissions-title">练习提交列表</h2>
                <p className="staff-dialog__description">{selectedAssignment.title}</p>
              </div>
              <button
                onClick={closeSubmissions}
                className="staff-icon-button"
                aria-label="关闭练习提交列表"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            
            <div className="staff-dialog__body">
              {/* Toolbar */}
              <div className="staff-toolbar staff-submission-toolbar">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    共 {submissionCounts.total} 份提交
                  </span>
                  <span className="text-sm text-green-600">
                    {submissionCounts.graded} 已批改
                  </span>
                  <span className="text-sm text-orange-500">
                    {submissionCounts.ungraded} 待批改
                  </span>
                </div>
                {submissionCounts.ungraded > 0 && (
                  <ProductButton variant="primary" disabled={submissionsLoading || Boolean(submissionsError)} onClick={() => setShowBatchGradeModal(true)}>
                    <CheckSquare className="w-4 h-4" aria-hidden="true" />
                    <span>一键批量批复</span>
                  </ProductButton>
                )}
              </div>

              <p className="text-sm text-gray-500">每页 25 份，按稳定顺序分页；新提交请刷新查看。翻页后默认仅选择本页未批改记录。</p>
              <div className="staff-toolbar">
                <ProductButton disabled={submissionsLoading || submissionHistory.length <= 1} onClick={() => { const history = submissionHistory.slice(0, -1); void fetchSubmissions(selectedAssignment.id, history[history.length - 1], history) }}>上一页</ProductButton>
                <span>第 {submissionHistory.length} 页 · 本页 {submissions.length} 份</span>
                <ProductButton disabled={submissionsLoading || !nextSubmissionCursor} onClick={() => void fetchSubmissions(selectedAssignment.id, nextSubmissionCursor, [...submissionHistory, nextSubmissionCursor])}>下一页</ProductButton>
                <ProductButton disabled={submissionsLoading} onClick={() => void fetchSubmissions(selectedAssignment.id)}>刷新提交列表</ProductButton>
              </div>

              {submissionsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-action"></div>
                </div>
              ) : submissionsError ? (
                <p role="alert">{submissionsError}<ProductButton onClick={() => void fetchSubmissions(selectedAssignment.id, submissionCursor, submissionHistory)}>重试提交列表</ProductButton></p>
              ) : submissions.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">暂无提交</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className={`border rounded-lg p-4 ${
                        submission.status === 'GRADED'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-action/10 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-action" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {submission.student.nickname || submission.student.username}
                            </p>
                            <p className="text-sm text-gray-500">
                              提交时间: {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            submission.status === 'GRADED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {submission.status === 'GRADED' ? '已批改' : '待批改'}
                        </span>
                      </div>

                      {/* 提交内容 */}
                      {submission.content && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                          <p className="whitespace-pre-wrap">{submission.content}</p>
                        </div>
                      )}

                      {/* 选择题答案 */}
                      {submission.answers && Object.keys(submission.answers).length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-gray-700 mb-2">{assignmentAnswerHeading(selectedAssignment?.questions as Question[] | undefined)}:</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(submission.answers).map(([key, value]) => (
                              <span key={key} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                                {formatAssignmentAnswer(selectedAssignment?.questions as Question[] | undefined, key, value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 评语 */}
                      {submission.comment && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                          <p className="text-sm font-medium text-green-800 mb-1">教师评语:</p>
                          <p className="text-sm text-green-700">{submission.comment}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalSurface>
      )}

      {/* Batch Grade Modal */}
      {showBatchGradeModal && (
        <ModalSurface open onClose={closeBatchGrade} className="staff-modal-backdrop">
          <div className="staff-dialog staff-dialog--compact" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="batch-grade-title">
            <div className="staff-dialog__header">
              <div>
                <h2 id="batch-grade-title">一键批量批复</h2>
                <p className="staff-dialog__description">已选择 {reviewSnapshot?.count ?? selectedSubmissions.size} 份待批改练习</p>
              </div>
            </div>
            
            <div className="staff-dialog__body staff-form">
              {/* Select All */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="text-sm font-medium text-gray-700">
                  本页待批改练习 ({ungradedSubmissions.length})
                </span>
                <button
                  onClick={toggleSelectAll}
                  disabled={isBatchGrading || selectionLoading}
                  className="text-sm text-action hover:text-action-hover flex items-center space-x-1"
                >
                  {selectedSubmissions.size === ungradedSubmissions.length ? (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      <span>取消本页全选</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      <span>全选本页</span>
                    </>
                  )}
                </button>
              </div>

              <ProductButton disabled={isBatchGrading || selectionLoading} onClick={() => void selectAllUngraded()}>{selectionLoading ? '正在选择…' : '选择全部未批改'}</ProductButton>
              <p className="text-sm text-gray-500">全部未批改按点击时冻结，最多 5000 份，有效期 15 分钟，不含之后新提交或重新提交的版本。重新勾选本页将取消全部选择。</p>
              {reviewSnapshot && <p role="status">已冻结选择 {reviewSnapshot.count} 份；批改时跳过已变化或已处理记录。</p>}

              {/* Submission List */}
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-2">
                {ungradedSubmissions
                  .map((submission) => (
                    <label
                      key={submission.id}
                      className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={isBatchGrading || selectionLoading}
                        checked={selectedSubmissions.has(submission.id)}
                        onChange={() => toggleSelectSubmission(submission.id)}
                        className="w-4 h-4 text-action rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {submission.student.nickname || submission.student.username}
                      </span>
                    </label>
                  ))}
              </div>

              {/* Comment Input */}
              <div>
                <label className="label flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>批复评语</span>
                </label>
                <textarea
                  disabled={isBatchGrading || reviewComment.current !== null}
                  value={batchComment}
                  onChange={(e) => setBatchComment(e.target.value)}
                  className="input w-full h-24"
                  placeholder="请输入评语..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  默认评语：你的练习质量很棒，再接再厉！
                </p>
              </div>

              {/* Actions */}
            </div>
            <div className="staff-dialog__actions">
              <ProductButton
                type="button"
                onClick={closeBatchGrade}
                disabled={isBatchGrading}
              >
                取消
              </ProductButton>
              <ProductButton
                type="button"
                variant="primary"
                onClick={handleBatchGrade}
                disabled={isBatchGrading || selectionLoading || (reviewSnapshot?.count ?? selectedSubmissions.size) === 0}
              >
                {isBatchGrading ? '批复中...' : `确认批复 (${reviewSnapshot?.count ?? selectedSubmissions.size}份)`}
              </ProductButton>
            </div>
          </div>
        </ModalSurface>
      )}
      {editorGuard.confirmation}
    </PageContainer>
  )
}

export default AssignmentList
