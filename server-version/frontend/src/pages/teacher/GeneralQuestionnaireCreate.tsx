import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'

const { TextArea } = Input

const GeneralQuestionnaireCreate: React.FC = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (values: any) => {
    try {
      setSaving(true)
      const token = localStorage.getItem('token')

      const response = await fetch('/api/general-questionnaires', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: values.code,
          name: values.name,
          description: values.description,
          instruction: values.instruction,
          estimatedTime: values.estimatedTime ? parseInt(values.estimatedTime) : undefined
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '创建问卷失败')
      }

      const data = await response.json()
      const questionnaireId = data.data.id

      message.success('泛化问卷创建成功')
      // 创建后自动跳转到编辑页面
      navigate(`/general-questionnaires/${questionnaireId}/edit`)
    } catch (err: any) {
      message.error(err.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <Card
        title={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/general-questionnaires')}>
              返回
            </Button>
            <span>创建泛化问卷</span>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 800 }}
        >
          <Form.Item
            name="code"
            label="问卷编码"
            rules={[{ required: true, message: '请输入问卷编码' }]}
          >
            <Input placeholder="唯一标识，如 GQ-001" />
          </Form.Item>

          <Form.Item
            name="name"
            label="问卷名称"
            rules={[{ required: true, message: '请输入问卷名称' }]}
          >
            <Input placeholder="如：学生心理健康普查问卷" />
          </Form.Item>

          <Form.Item
            name="description"
            label="问卷描述"
          >
            <TextArea rows={3} placeholder="问卷的用途说明" />
          </Form.Item>

          <Form.Item
            name="instruction"
            label="指导语"
          >
            <TextArea rows={4} placeholder="测评前的指导说明，会显示给被测评者" />
          </Form.Item>

          <Form.Item
            name="estimatedTime"
            label="预计用时（分钟）"
          >
            <Input type="number" min={1} placeholder="如 15" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
              >
                创建问卷
              </Button>
              <Button onClick={() => navigate('/general-questionnaires')}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default GeneralQuestionnaireCreate
