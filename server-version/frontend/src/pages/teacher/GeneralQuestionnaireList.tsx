import React, { useEffect, useState } from 'react'
import { CheckCircle, Copy, Download, Edit3, Link2, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { sessionFetch } from '../../api/client'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import ManagementDialog from '../../components/staff-ui/ManagementDialog'
import MoreActions from '../../components/staff-ui/MoreActions'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

const GeneralQuestionnaireList: React.FC = () => {
  const navigate = useNavigate()
  const { feedback, info, error: showError } = useStaffFeedback()
  const [questionnaires, setQuestionnaires] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenModalVisible, setTokenModalVisible] = useState(false)
  const [currentQuestionnaire, setCurrentQuestionnaire] = useState<any>(null)

  useEffect(() => {
    void fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await sessionFetch('/api/general-questionnaires')
      if (!response.ok) throw new Error('获取泛化问卷列表失败')
      const data = await response.json()
      setQuestionnaires(data.data?.list || [])
    } catch (err: any) {
      setError(err.message || '获取列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/export`)
      if (!response.ok) throw new Error('导出数据失败')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `general_questionnaire_data_${Date.now()}.csv`
      anchor.click()
      window.URL.revokeObjectURL(url)
      info('数据导出成功', 'CSV 文件已开始下载。')
    } catch (err: any) {
      showError('导出失败', err.message || '请稍后重试')
    }
  }

  const handleDuplicate = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/duplicate`, { method: 'POST' })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '复制失败')
      }
      info('问卷复制成功', '已创建新的草稿副本。')
      void fetchQuestionnaires()
    } catch (err: any) {
      showError('复制失败', err.message || '请稍后重试')
    }
  }

  const handlePublish = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/publish`, { method: 'POST' })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '发布失败')
      }
      info('问卷发布成功', '公开参与入口可以继续通过令牌管理配置。')
      void fetchQuestionnaires()
    } catch (err: any) {
      showError('发布失败', err.message || '请稍后重试')
    }
  }

  const openDelivery = (questionnaire: any) => {
    setCurrentQuestionnaire(questionnaire)
    setTokenModalVisible(true)
  }

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="泛化问卷管理"
        description="创建和发布问卷，管理公开参与链接并导出作答数据。"
        actions={(
          <ProductButton variant="primary" onClick={() => navigate('/general-questionnaires/create')}>
            <Plus className="h-4 w-4" aria-hidden="true" />创建问卷
          </ProductButton>
        )}
      />

      {error && (
        <ProductStatus
          kind="error"
          title="问卷列表暂时无法加载"
          announce="assertive"
          actions={<ProductButton onClick={() => void fetchQuestionnaires()}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      )}

      {loading ? (
        <ProductStatus kind="pending" title="正在加载泛化问卷" announce="polite">正在读取问卷目录。</ProductStatus>
      ) : error ? null : questionnaires.length === 0 ? (
        <div className="staff-empty">
          <span>暂无泛化问卷</span>
          <ProductButton variant="primary" onClick={() => navigate('/general-questionnaires/create')}>
            <Plus className="h-4 w-4" aria-hidden="true" />创建第一份问卷
          </ProductButton>
        </div>
      ) : (
        <div className="staff-table-container">
          <table className="staff-table">
            <thead>
              <tr>
                <th>问卷名称</th>
                <th>问卷编码</th>
                <th>状态</th>
                <th>包含量表</th>
                <th>创建时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {questionnaires.map((record) => (
                <tr key={record.id}>
                  <td><strong className="staff-record-title">{record.name}</strong></td>
                  <td>{record.code}</td>
                  <td><span className={`staff-badge ${record.status === 'PUBLISHED' ? 'staff-badge--success' : 'staff-badge--warning'}`}>{record.status === 'PUBLISHED' ? '已发布' : '草稿'}</span></td>
                  <td>{record.questionnaireScales?.length || 0}</td>
                  <td>{new Date(record.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="staff-table-actions">
                      {record.status === 'DRAFT' && (
                        <button type="button" className="staff-text-action" onClick={() => navigate(`/general-questionnaires/${record.id}/edit`)}>
                          <Edit3 className="h-4 w-4" aria-hidden="true" />编辑
                        </button>
                      )}
                      <MoreActions label={`${record.name} 的更多操作`}>
                        <button type="button" onClick={() => void handleDuplicate(record.id)}><Copy className="h-4 w-4" aria-hidden="true" />复制</button>
                        {record.status === 'DRAFT' && <button type="button" onClick={() => void handlePublish(record.id)}><CheckCircle className="h-4 w-4" aria-hidden="true" />发布</button>}
                        {record.status === 'PUBLISHED' && <button type="button" onClick={() => openDelivery(record)}><Link2 className="h-4 w-4" aria-hidden="true" />令牌管理</button>}
                        {record.status === 'PUBLISHED' && <button type="button" onClick={() => void handleExportData(record.id)}><Download className="h-4 w-4" aria-hidden="true" />导出数据</button>}
                      </MoreActions>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManagementDialog
        open={tokenModalVisible && Boolean(currentQuestionnaire)}
        title={`令牌管理 · ${currentQuestionnaire?.name || ''}`}
        description="管理公开参与链接、截止时间和参与次数。"
        onClose={() => setTokenModalVisible(false)}
        width="wide"
      >
        {tokenModalVisible && currentQuestionnaire && (
          <PublicDeliveryManager
            key={currentQuestionnaire.id}
            family="QUESTIONNAIRE"
            resourceId={currentQuestionnaire.id}
            canCreate={currentQuestionnaire.status === 'PUBLISHED'}
          />
        )}
      </ManagementDialog>
    </ProductPage>
  )
}

export default GeneralQuestionnaireList
