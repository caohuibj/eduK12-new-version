import React, { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { sessionFetch } from '../../api/client'
import { PageHeader, ProductButton, ProductPage } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

const GeneralQuestionnaireCreate: React.FC = () => {
  const navigate = useNavigate()
  const { feedback, error: showError, success } = useStaffFeedback()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    instruction: '',
    estimatedTime: '',
  })

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.code.trim() || !form.name.trim()) return
    try {
      setSaving(true)
      const response = await sessionFetch('/api/general-questionnaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description || undefined,
          instruction: form.instruction || undefined,
          estimatedTime: form.estimatedTime ? parseInt(form.estimatedTime, 10) : undefined,
        }),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.message || '创建问卷失败')
      }
      const data = await response.json()
      success('泛化问卷创建成功', '继续编排量表与表单内容。')
      navigate(`/general-questionnaires/${data.data.id}/edit`)
    } catch (err: any) {
      showError('创建失败', err.message || '请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6">
      {feedback}
      <PageHeader
        title="创建历史泛化问卷"
        description="历史编制入口：仅在需要新版暂未覆盖的能力时使用。新问卷优先使用新版聚合问卷。"
        actions={(
          <ProductButton onClick={() => navigate('/general-questionnaires')}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />返回问卷列表
          </ProductButton>
        )}
      />

      <section className="staff-panel">
        <header className="staff-panel__header">
          <div><h2>基本信息</h2><p>编码与名称用于后台管理；描述和指导语会参与后续展示。</p></div>
        </header>
        <div className="staff-panel__body">
          <form className="staff-form" onSubmit={handleSubmit}>
            <div className="staff-form-grid">
              <label className="staff-field">
                问卷编码
                <input required value={form.code} onChange={event => update('code', event.target.value)} placeholder="唯一标识，如 GQ-001" />
              </label>
              <label className="staff-field">
                问卷名称
                <input required value={form.name} onChange={event => update('name', event.target.value)} placeholder="如：学生心理健康普查问卷" />
              </label>
              <label className="staff-field staff-field--full">
                问卷描述
                <textarea rows={3} value={form.description} onChange={event => update('description', event.target.value)} placeholder="问卷的用途说明" />
              </label>
              <label className="staff-field staff-field--full">
                指导语
                <textarea rows={4} value={form.instruction} onChange={event => update('instruction', event.target.value)} placeholder="测评前的指导说明，会显示给被测评者" />
              </label>
              <label className="staff-field">
                预计用时（分钟）
                <input type="number" min={1} value={form.estimatedTime} onChange={event => update('estimatedTime', event.target.value)} placeholder="如 15" />
              </label>
            </div>
            <div className="staff-inline-actions">
              <ProductButton variant="primary" type="submit" disabled={saving || !form.code.trim() || !form.name.trim()}>
                <Save className="h-4 w-4" aria-hidden="true" />{saving ? '创建中...' : '创建问卷'}
              </ProductButton>
              <ProductButton onClick={() => navigate('/general-questionnaires')}>取消</ProductButton>
            </div>
          </form>
        </div>
      </section>
    </ProductPage>
  )
}

export default GeneralQuestionnaireCreate
