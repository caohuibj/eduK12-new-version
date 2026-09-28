import React, { useState, useEffect } from 'react'
import apiClient from '../../api/client'
import { CheckCircle, Clock, FileText, Layers, PlayCircle } from 'lucide-react'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'

interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  instruction: string | null
  estimatedTime: number | null
  scaleCount: number
  totalItems: number
  courses: Array<{
    id: string
    title: string
  }>
  completed: boolean
  inProgress: boolean
  completedAt: string | null
  assessmentId: string | null
  activeAttempt?: { id: string; startedAt: string; progress: number } | null
  latestCompletedAttempt?: { id: string; completedAt: string | null } | null
  attemptCount?: number
  retakeAllowed?: boolean
}

const questionnaireDestination = (questionnaire: Questionnaire) => (
  questionnaire.inProgress
    ? `/student/questionnaires/${questionnaire.id}`
    : questionnaire.completed && questionnaire.assessmentId
      ? `/student/questionnaires/result/${questionnaire.assessmentId}`
      : `/student/questionnaires/${questionnaire.id}`
)

const StudentQuestionnaires: React.FC = () => {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      setError(null)
      const response = await apiClient.get<{ list: Questionnaire[] }>('/questionnaires/available')
      if (response.code !== 0) throw new Error(response.message || '获取问卷列表失败')
      setQuestionnaires(response.data.list)
      const mixed = await apiClient.get<any>('/questionnaire-products/available')
      if (mixed.code !== 0) throw new Error(mixed.message)
      setCollections(mixed.data)

    } catch (reason) {
      console.error('获取问卷列表失败', reason)
      setError(reason instanceof Error ? reason.message : '获取问卷列表失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProductPage width="assessment" className="hui-student-page hui-student-assessments">
      <PageHeader title="聚合问卷" description="按顺序完成量表、认知测验、情境判断与表单，各项结果独立展示。" />

      {loading ? (
        <ProductStatus kind="pending" title="正在加载问卷" announce="polite" />
      ) : error ? (
        <ProductStatus kind="error" title="问卷列表加载失败" announce="assertive">{error}</ProductStatus>
      ) : questionnaires.length === 0 && collections.length === 0 ? (
        <ProductStatus kind="info" title="暂无可用的问卷">当有适用于你的已发布问卷后，会显示在这里。</ProductStatus>
      ) : (
        <div className="grid gap-4">
          {collections.map(row => <DiscoveryCard key={row.id} to={row.href} title={row.name} description={row.description} notice={row.canContinue ? '继续当前问卷作答' : row.availability !== 'OPEN' ? '当前问卷尚未开放或已结束' : '各项测评独立反馈'} meta={<span>{row.estimatedModules} 个内容单元</span>} />)}
          {questionnaires.map((questionnaire) => (
            <DiscoveryCard
              key={questionnaire.id}
              to={questionnaireDestination(questionnaire)}
              title={questionnaire.name}
              ariaLabel={`${questionnaire.name}${questionnaire.inProgress ? '，继续作答' : questionnaire.completed ? '，查看结果' : '，开始测评'}`}
              status={questionnaire.inProgress ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><PlayCircle className="h-3.5 w-3.5" />进行中</span>
              ) : questionnaire.completed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle className="h-3.5 w-3.5" />已完成</span>
              ) : undefined}
              description={questionnaire.description}
              meta={(
                <>
                  <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" aria-hidden="true" />{questionnaire.scaleCount} 个量表</span>
                  <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" aria-hidden="true" />{questionnaire.totalItems} 道题目</span>
                  {questionnaire.estimatedTime ? <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />约 {questionnaire.estimatedTime} 分钟</span> : null}
                  {questionnaire.courses.length > 0 ? <span>课程：{questionnaire.courses[0].title}</span> : null}
                </>
              )}
              notice={questionnaire.inProgress ? '已有进行中的问卷尝试，进入后继续当前尝试。' : undefined}
            />
          ))}
        </div>
      )}
    </ProductPage>
  )
}

export default StudentQuestionnaires
