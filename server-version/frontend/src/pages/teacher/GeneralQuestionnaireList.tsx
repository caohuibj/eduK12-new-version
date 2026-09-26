import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useState, useEffect } from 'react'
import { Alert, Button, Card, Empty, message, Modal, Space, Table, Tag } from 'antd'
import { PlusOutlined, LinkOutlined, CheckCircleOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { sessionFetch } from '../../api/client'
import { PageHeader, ProductPage } from '../../components/product-ui'

const GeneralQuestionnaireList: React.FC = () => {
  const navigate = useNavigate()
  const [questionnaires, setQuestionnaires] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenModalVisible, setTokenModalVisible] = useState(false)
  const [currentQuestionnaire, setCurrentQuestionnaire] = useState<any>(null)

  useEffect(() => {
    fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await sessionFetch('/api/general-questionnaires')

      if (!response.ok) {
        throw new Error('获取泛化问卷列表失败')
      }

      const data = await response.json()
      setQuestionnaires(data.data?.list || [])
    } catch (err: any) {
      setError(err.message || '获取列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateQuestionnaire = () => {
    navigate('/general-questionnaires/create')
  }

  const handleManageTokens = async (questionnaire: any) => {
    setCurrentQuestionnaire(questionnaire)
    setTokenModalVisible(true)
  }

  const handleExportData = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/export`)

      if (!response.ok) {
        throw new Error('导出数据失败')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `general_questionnaire_data_${Date.now()}.csv`
      a.click()

      message.success('数据导出成功')
    } catch (err: any) {
      message.error(err.message || '导出失败')
    }
  }

  const handleDuplicate = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/duplicate`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '复制失败')
      }

      message.success('问卷复制成功')
      fetchQuestionnaires()
    } catch (err: any) {
      message.error(err.message || '复制失败')
    }
  }

  const handlePublish = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/publish`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '发布失败')
      }

      message.success('问卷发布成功')
      fetchQuestionnaires()
    } catch (err: any) {
      message.error(err.message || '发布失败')
    }
  }

  const columns = [
    {
      title: '问卷名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '问卷编码',
      dataIndex: 'code',
      key: 'code'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'PUBLISHED' ? 'green' : 'orange'}>
          {status === 'PUBLISHED' ? '已发布' : '草稿'}
        </Tag>
      )
    },
    {
      title: '包含量表',
      key: 'scales',
      render: (_: any, record: any) => record.questionnaireScales?.length || 0
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString()
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space wrap>
          <Button
            type="link"
            icon={<CopyOutlined />}
            onClick={() => handleDuplicate(record.id)}
          >
            复制
          </Button>
          {record.status === 'DRAFT' && (
            <>
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => navigate(`/general-questionnaires/${record.id}/edit`)}
              >
                编辑
              </Button>
              <Button
                type="link"
                icon={<CheckCircleOutlined />}
                onClick={() => handlePublish(record.id)}
              >
                发布
              </Button>
            </>
          )}
          {record.status === 'PUBLISHED' && (
            <>
              <Button
                type="link"
                icon={<LinkOutlined />}
                onClick={() => handleManageTokens(record)}
              >
                令牌管理
              </Button>
              <Button
                type="link"
                onClick={() => handleExportData(record.id)}
              >
                导出数据
              </Button>
            </>
          )}
        </Space>
      )
    }
  ]

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader
        title="泛化问卷管理"
        description="创建、发布和管理泛化问卷；公开令牌与数据导出仍使用现有授权接口。"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateQuestionnaire}
          >
            创建问卷
          </Button>
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message="问卷列表暂时无法加载"
          description={error}
          action={<Button onClick={() => void fetchQuestionnaires()}>重试</Button>}
        />
      )}

      <Card>
        <Table
          columns={columns}
          dataSource={questionnaires}
          rowKey="id"
          loading={loading}
          scroll={{ x: 820 }}
          locale={{
            emptyText: error
              ? '请修复加载错误后重试'
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无泛化问卷" />,
          }}
        />
      </Card>

      <Modal
        title={`令牌管理 - ${currentQuestionnaire?.name || ''}`}
        open={tokenModalVisible}
        onCancel={() => setTokenModalVisible(false)}
        footer={null}
        width={900}
      >
        {tokenModalVisible && currentQuestionnaire && <PublicDeliveryManager key={currentQuestionnaire.id} family="QUESTIONNAIRE" resourceId={currentQuestionnaire.id} canCreate={currentQuestionnaire.status === 'PUBLISHED'} />}
      </Modal>
    </ProductPage>
  )
}

export default GeneralQuestionnaireList
