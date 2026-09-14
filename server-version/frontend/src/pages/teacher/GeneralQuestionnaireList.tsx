import React, { useState, useEffect } from 'react'
import { Alert, Button, Card, Empty, Form, InputNumber, message, Modal, Space, Table, Tag } from 'antd'
import { PlusOutlined, LinkOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons'
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
  const [tokens, setTokens] = useState<any[]>([])
  const [tokenForm] = Form.useForm()

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
    await fetchTokens(questionnaire.id)
  }

  const fetchTokens = async (questionnaireId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${questionnaireId}/tokens`)

      if (!response.ok) {
        throw new Error('获取令牌列表失败')
      }

      const data = await response.json()
      setTokens(data.data?.list || [])
    } catch (err: any) {
      message.error(err.message || '获取令牌失败')
    }
  }

  const handleGenerateToken = async (values: any) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${currentQuestionnaire.id}/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expiresDays: values.expiresIn,
          maxUses: values.maxUses || 0
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '生成令牌失败')
      }

      const data = await response.json()

      message.success('令牌生成成功')
      tokenForm.resetFields()
      await fetchTokens(currentQuestionnaire.id)

      if (data.data?.token) {
        const link = `${window.location.origin}/public/questionnaire/${data.data.token}`
        await navigator.clipboard.writeText(link)
        message.success('链接已复制到剪贴板')
      }
    } catch (err: any) {
      message.error(err.message || '生成令牌失败')
    }
  }

  const handleDisableToken = async (tokenId: string) => {
    try {
      const response = await sessionFetch(`/api/general-questionnaires/${currentQuestionnaire.id}/tokens/${tokenId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('禁用令牌失败')
      }

      message.success('令牌已禁用')
      await fetchTokens(currentQuestionnaire.id)
    } catch (err: any) {
      message.error(err.message || '操作失败')
    }
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

  const tokenColumns = [
    {
      title: '令牌',
      dataIndex: 'token',
      key: 'token',
      render: (token: string) => (
        <Space wrap>
          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
            {token.substring(0, 16)}...
          </code>
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => {
              const link = `${window.location.origin}/public/questionnaire/${token}`
              navigator.clipboard.writeText(link)
              message.success('链接已复制')
            }}
          >
            复制链接
          </Button>
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? '有效' : '已禁用'}
        </Tag>
      )
    },
    {
      title: '使用次数',
      key: 'usage',
      render: (_: any, record: any) => `${record.usedCount} / ${record.maxUses || '∞'}`
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: string) => new Date(date).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDisableToken(record.id)}
          disabled={!record.isActive}
        >
          禁用
        </Button>
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
        <div className="mb-6">
          <h4 className="font-semibold mb-3">生成新令牌</h4>
          <Form
            form={tokenForm}
            layout="inline"
            onFinish={handleGenerateToken}
          >
            <Form.Item
              name="expiresIn"
              label="有效期（天）"
              rules={[{ required: true, message: '请输入有效期' }]}
            >
              <InputNumber min={1} max={365} defaultValue={30} />
            </Form.Item>
            <Form.Item
              name="maxUses"
              label="最大使用次数"
              extra="0表示无限制"
            >
              <InputNumber min={0} defaultValue={0} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                生成令牌
              </Button>
            </Form.Item>
          </Form>
        </div>

        <div>
          <h4 className="font-semibold mb-3">已生成令牌</h4>
          <Table
            columns={tokenColumns}
            dataSource={tokens}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 680 }}
            locale={{ emptyText: '暂无令牌' }}
          />
        </div>
      </Modal>
    </ProductPage>
  )
}

export default GeneralQuestionnaireList
