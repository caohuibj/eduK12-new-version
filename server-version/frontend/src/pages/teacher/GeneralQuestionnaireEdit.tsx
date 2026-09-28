import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { Save, Plus, Trash2, ChevronLeft, GripVertical, Layers, FileText, Edit3 } from 'lucide-react'
import { ScaleSelector } from '../../components/ScaleSelector'
import type { Scale } from '../../components/ScaleSelector/types'
import { contextOptionsForKey, contextValueHint } from '../../modules/assessment-context/options'
import FormSectionManager from '../../components/FormSectionManager'
import { ProductPage, ProductStatus } from '../../components/product-ui'

// 表单题目类型
interface FormItem {
  id: string
  type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month'
  label: string
  placeholder: string | null
  required: boolean
  position: number
  options: Array<{ value: string; label: string }> | null
  contextKey: string | null
  createdAt: string
  updatedAt: string
}

// 量表关联类型
interface QuestionnaireScale {
  id: string
  scaleId: string
  position: number
  scale: Scale
}

const scaleItemCount = (scale: Scale | undefined): number => {
  const definition = scale?.definition
  return definition?.schemaVersion === 2 && Array.isArray(definition.items)
    ? definition.items.length
    : 0
}

// 统一内容项类型
interface ContentItem {
  type: 'form' | 'scale'
  id: string
  position: number
  data: FormItem | QuestionnaireScale
}

interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  instruction: string | null
  status: string
  estimatedTime: number | null
}

const GeneralQuestionnaireEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'tokens'>('basic')

  // 问卷基本信息
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>({
    id: '',
    code: '',
    name: '',
    description: '',
    instruction: '',
    status: 'DRAFT',
    estimatedTime: 30,
  })

  // 可用的量表列表
  const [availableScales, setAvailableScales] = useState<Scale[]>([])

  // 表单题目列表
  const [formItems, setFormItems] = useState<FormItem[]>([])

  // 已关联的量表
  const [questionnaireScales, setQuestionnaireScales] = useState<QuestionnaireScale[]>([])

  // 选中的量表ID列表（用于穿梭框）
  const [selectedScaleIds, setSelectedScaleIds] = useState<string[]>([])


  // 表单题目编辑弹窗状态
  const [showFormItemModal, setShowFormItemModal] = useState(false)
  const [editingFormItem, setEditingFormItem] = useState<FormItem | null>(null)
  const [formData, setFormData] = useState<{
    type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month'
    label: string
    placeholder: string
    required: boolean
    options: Array<{ value: string; label: string }>
    contextKey: string
  }>({
    type: 'fill_blank',
    label: '',
    placeholder: '',
    required: true,
    options: [],
    contextKey: '',
  })

  useEffect(() => {
    if (id) {
      fetchQuestionnaire()
      fetchContent()
    }
    fetchAvailableScales()
  }, [id])

  const fetchQuestionnaire = async () => {
    try {
      const response = await apiClient.get<Questionnaire>(`/general-questionnaires/${id}`)
      if (response.code === 0) {
        setQuestionnaire(response.data)
      }
    } catch (err) {
      console.error('获取问卷信息失败', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchContent = async () => {
    try {
      const [formRes, scalesRes] = await Promise.all([
        apiClient.get<{ list: FormItem[] }>(`/general-questionnaires/${id}/form-items`),
        apiClient.get<{ list: QuestionnaireScale[] }>(`/general-questionnaires/${id}/scales`),
      ])

      if (formRes.code === 0) {
        setFormItems(formRes.data.list)
      }
      if (scalesRes.code === 0) {
        setQuestionnaireScales(scalesRes.data.list)
        // 同步到穿梭框选中状态
        setSelectedScaleIds(scalesRes.data.list.map((qs: QuestionnaireScale) => qs.scaleId))
      }
    } catch (err) {
      console.error('获取内容列表失败', err)
    }
  }

  const fetchAvailableScales = async () => {
    try {
      const response = await apiClient.get<{ list: Scale[] }>('/scales?status=PUBLISHED&page=1&pageSize=100')
      if (response.code === 0) {
        setAvailableScales(response.data.list.filter(s => s.status === 'PUBLISHED'))
      }
    } catch (err) {
      console.error('获取量表列表失败', err)
    }
  }

  const handleSaveBasic = async () => {
    if (!questionnaire.name) {
      alert('问卷名称不能为空')
      return
    }

    try {
      setSaving(true)
      const response = await apiClient.put<Questionnaire>(`/general-questionnaires/${id}`, {
        name: questionnaire.name,
        description: questionnaire.description,
        instruction: questionnaire.instruction,
        estimatedTime: questionnaire.estimatedTime,
      })
      if (response.code === 0) {
        setQuestionnaire(response.data)
        alert('保存成功')
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 处理量表选择变化
  const handleScaleChange = async (newSelectedIds: string[]) => {
    const added = newSelectedIds.filter(id => !selectedScaleIds.includes(id))
    const removed = selectedScaleIds.filter(id => !newSelectedIds.includes(id))

    // 添加新量表
    for (const scaleId of added) {
      try {
        await apiClient.post(`/general-questionnaires/${id}/scales`, {
          scaleId,
          position: questionnaireScales.length + formItems.length,
        })
      } catch (err) {
        console.error('添加量表失败', err)
      }
    }

    // 移除量表
    for (const scaleId of removed) {
      try {
        await apiClient.delete(`/general-questionnaires/${id}/scales/${scaleId}`)
      } catch (err) {
        console.error('移除量表失败', err)
      }
    }

    setSelectedScaleIds(newSelectedIds)
    fetchContent()
  }

  // 添加表单题目
  const handleAddFormItem = async () => {
    if (!formData.label) {
      alert('题目标签不能为空')
      return
    }

    try {
      const dataToSend = {
        ...formData,
        options: ['single_choice', 'multiple_choice'].includes(formData.type) ? formData.options : null,
        contextKey: formData.contextKey || null,
      }

      if (editingFormItem) {
        const response = await apiClient.put<FormItem>(
          `/general-questionnaires/${id}/form-items/${editingFormItem.id}`,
          dataToSend
        )
        if (response.code === 0) {
          fetchContent()
          setShowFormItemModal(false)
          resetFormData()
        } else {
          alert(response.message)
        }
      } else {
        const response = await apiClient.post<FormItem>(
          `/general-questionnaires/${id}/form-items`,
          dataToSend
        )
        if (response.code === 0) {
          fetchContent()
          setShowFormItemModal(false)
          resetFormData()
        } else {
          alert(response.message)
        }
      }
    } catch (err: any) {
      alert(err.message || '操作失败')
    }
  }

  // 删除表单题目
  const handleRemoveFormItem = async (itemId: string) => {
    if (!confirm('确定要删除此表单题目吗？')) return

    try {
      const response = await apiClient.delete(`/general-questionnaires/${id}/form-items/${itemId}`)
      if (response.code === 0) {
        setFormItems(formItems.filter(fi => fi.id !== itemId))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  // 编辑表单题目
  const handleEditFormItem = (item: FormItem) => {
    setEditingFormItem(item)
    setFormData({
      type: item.type,
      label: item.label,
      placeholder: item.placeholder || '',
      required: item.required,
      options: item.options || [],
      contextKey: item.contextKey || '',
    })
    setShowFormItemModal(true)
  }

  // 重置表单数据
  const resetFormData = () => {
    setEditingFormItem(null)
    setFormData({
      type: 'fill_blank',
      label: '',
      placeholder: '',
      required: true,
      options: [],
      contextKey: '',
    })
  }

  // 发布问卷
  const handlePublish = async () => {
    if (questionnaireScales.length === 0 && formItems.length === 0) {
      alert('问卷必须包含至少一个量表或表单题目')
      return
    }

    try {
      const response = await apiClient.post(`/general-questionnaires/${id}/publish`)
      if (response.code === 0) {
        setQuestionnaire({ ...questionnaire, status: 'PUBLISHED' })
        alert('发布成功')
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '发布失败')
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fill_blank':
        return '填空题'
      case 'single_choice':
        return '单选题'
      case 'text_input':
        return '文本输入'
      case 'multiple_choice':
        return '多选题'
      case 'year_month':
        return '年月选择'
      default:
        return type
    }
  }

  if (loading) {
    return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载泛化问卷" announce="polite">正在读取问卷配置。</ProductStatus></ProductPage>
  }

  // 合并所有内容项并排序
  const allContentItems: ContentItem[] = [
    ...formItems.map(fi => ({ type: 'form' as const, id: fi.id, position: fi.position, data: fi })),
    ...questionnaireScales.map(qs => ({ type: 'scale' as const, id: qs.id, position: qs.position, data: qs })),
  ].sort((a, b) => a.position - b.position)

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6">
      {/* Header */}
      <div className="staff-editor-heading">
        <div className="staff-editor-heading__copy">
          <div className="flex items-center gap-3">
          <Link to="/general-questionnaires" className="text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1>编辑泛化问卷</h1>
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              questionnaire.status === 'PUBLISHED'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {questionnaire.status === 'PUBLISHED' ? '已发布' : '草稿'}
          </span>
          </div>
          <p>{questionnaire.name} · {questionnaire.code}</p>
        </div>
        <div className="staff-inline-actions">
          {questionnaire.status === 'DRAFT' && (
            <button
              onClick={handlePublish}
              className="hui-button hui-button--primary inline-flex items-center gap-2"
            >
              发布问卷
            </button>
          )}
          {activeTab === 'basic' && (
            <button
              onClick={handleSaveBasic}
              disabled={saving}
              className="hui-button hui-button--primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="staff-toolbar">
        <nav className="staff-segmented" aria-label="问卷编辑分区">
          {[
            { key: 'basic', label: '基本信息' },
            { key: 'content', label: '内容编排' },
            { key: 'tokens', label: '访问令牌' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              aria-pressed={activeTab === tab.key}
              className=""
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Basic Info Tab */}
      {activeTab === 'basic' && (
        <section className="staff-panel">
          <div className="staff-panel__body">
          <div className="staff-form-grid">
            <div>
              <label className="staff-field">
                问卷编码
              </label>
              <input
                type="text"
                value={questionnaire.code}
                disabled
                className="bg-slate-100"
              />
            </div>
            <div>
              <label className="staff-field">
                问卷名称 *
              </label>
              <input
                type="text"
                value={questionnaire.name}
                onChange={(e) => setQuestionnaire({ ...questionnaire, name: e.target.value })}
                className=""
              />
            </div>
            <div className="md:col-span-2">
              <label className="staff-field">
                问卷描述
              </label>
              <textarea
                value={questionnaire.description || ''}
                onChange={(e) => setQuestionnaire({ ...questionnaire, description: e.target.value })}
                rows={3}
                className=""
              />
            </div>
            <div>
              <label className="staff-field">
                预计用时（分钟）
              </label>
              <input
                type="number"
                value={questionnaire.estimatedTime || ''}
                onChange={(e) =>
                  setQuestionnaire({ ...questionnaire, estimatedTime: parseInt(e.target.value) || null })
                }
                className=""
              />
            </div>
            <div className="md:col-span-2">
              <label className="staff-field">
                指导语
              </label>
              <textarea
                value={questionnaire.instruction || ''}
                onChange={(e) => setQuestionnaire({ ...questionnaire, instruction: e.target.value })}
                rows={4}
                className=""
                placeholder="指导用户如何作答..."
              />
            </div>
          </div>
          </div>
        </section>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* 量表选择 */}
          <section className="staff-panel">
            <header className="staff-panel__header"><div><h2>选择量表</h2><p>从可用量表中选择问卷需要包含的测评内容。</p></div></header>
            <div className="staff-panel__body">
            <ScaleSelector
              scales={availableScales}
              selected={selectedScaleIds}
              onChange={handleScaleChange}
              loading={false}
            />
            </div>
          </section>

          {/* 表单题目操作按钮 */}
          <section className="staff-panel staff-panel--compact"><div className="staff-panel__body">
            <button
              onClick={() => {
                resetFormData()
                setShowFormItemModal(true)
              }}
              className="hui-button hui-button--primary inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4 mr-2" />
              添加表单题目
            </button>
            </div></section>

          {/* 内容列表 */}
          <section className="staff-panel">
            <header className="staff-panel__header"><div><h2>问卷内容（按顺序）</h2><p>量表和表单题目按当前位置依次呈现。</p></div></header>
            <div className="staff-panel__body">
            {allContentItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>暂无内容</p>
                <p className="text-sm mt-2">请在上方添加量表或表单题目</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allContentItems.map((item, index) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 group"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                      <span className="text-sm text-gray-500 w-8">{index + 1}.</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        item.type === 'form'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.type === 'form' ? '表单' : '量表'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {item.type === 'form'
                          ? (item.data as FormItem).label
                          : (item.data as QuestionnaireScale).scale?.name}
                      </span>
                      {item.type === 'form' && (
                        <span className="text-xs text-gray-500">
                          ({getTypeLabel((item.data as FormItem).type)})
                        </span>
                      )}
                      {item.type === 'form' && (item.data as FormItem).contextKey && (
                        <span className="text-xs text-amber-700">（用于测评参考）</span>
                      )}
                      {item.type === 'scale' && (
                        <span className="text-xs text-gray-500">
                          ({scaleItemCount((item.data as QuestionnaireScale).scale)}题)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.type === 'form' && (
                        <button
                          onClick={() => handleEditFormItem(item.data as FormItem)}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="编辑"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (item.type === 'form') {
                            handleRemoveFormItem(item.id)
                          } else {
                            if (confirm('确定要移除此量表吗？')) {
                              const qs = item.data as QuestionnaireScale
                              apiClient.delete(`/general-questionnaires/${id}/scales/${qs.scaleId}`)
                                .then(() => fetchContent())
                            }
                          }
                        }}
                        className="p-1 text-red-600 hover:text-red-800"
                        title={item.type === 'form' ? '删除' : '移除'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>

          {id && (
            <FormSectionManager
              basePath={`/general-questionnaires/${id}`}
              readOnly={questionnaire.status !== 'DRAFT'}
            />
          )}
        </div>
      )}

      {activeTab === 'tokens' && id && <PublicDeliveryManager key={id} family="QUESTIONNAIRE" resourceId={id} canCreate={questionnaire.status === 'PUBLISHED'} />}

      {/* 表单题目编辑弹窗 */}
      {showFormItemModal && (
        <div className="staff-modal-backdrop" role="presentation">
          <div className="staff-dialog staff-dialog--compact" role="dialog" aria-modal="true" aria-label={editingFormItem ? '编辑表单题目' : '添加表单题目'}>
            <div className="staff-dialog__body">
            <h3 className="text-lg font-medium mb-4">
              {editingFormItem ? '编辑表单题目' : '添加表单题目'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="staff-field">
                  题目类型 *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => {
                    const nextType = e.target.value as typeof formData.type
                    const forcedType = formData.contextKey
                      ? formData.contextKey === 'birthYearMonth' ? 'year_month' : 'single_choice'
                      : nextType
                    setFormData({
                      ...formData,
                      type: forcedType,
                      options: ['single_choice', 'multiple_choice'].includes(forcedType) ? formData.options : [],
                    })
                  }}
                  className=""
                >
                  <option value="fill_blank">填空题（短文本）</option>
                  <option value="single_choice">单选题</option>
                  <option value="multiple_choice">多选题</option>
                  <option value="text_input">文本输入（长文本）</option>
                  <option value="year_month">年月选择</option>
                </select>
              </div>
              <div>
                <label className="staff-field">
                  用于测评参考
                </label>
                <select
                  value={formData.contextKey}
                  onChange={(e) => {
                    const contextKey = e.target.value
                    const nextType = contextKey === 'birthYearMonth'
                      ? 'year_month'
                      : contextKey
                        ? 'single_choice'
                        : formData.type === 'year_month' ? 'fill_blank' : formData.type
                    setFormData({
                      ...formData,
                      contextKey,
                      type: nextType,
                      options: contextKey && contextKey !== formData.contextKey
                        ? contextOptionsForKey(contextKey)
                        : ['single_choice', 'multiple_choice'].includes(nextType) ? formData.options : [],
                    })
                  }}
                  className=""
                >
                  <option value="">不绑定人口学含义</option>
                  <option value="birthYearMonth">出生年月（YYYY-MM）</option>
                  <option value="sexAtBirth">出生时性别</option>
                  <option value="gradeLevel">年级</option>
                  <option value="primaryLanguage">主要语言（BCP 47）</option>
                  <option value="countryOrRegion">国家/地区（ISO 两位代码）</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  只选择明确绑定的字段才会进入本次问卷的参考上下文；标签可以按需要本地化。
                </p>
                {formData.contextKey && contextValueHint(formData.contextKey) && (
                  <p className="text-xs text-blue-600 mt-1">{contextValueHint(formData.contextKey)}</p>
                )}
              </div>
              <div>
                <label className="staff-field">
                  题目标签 *
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className=""
                  placeholder="如：性别、年龄、意见反馈"
                />
              </div>
              <div>
                <label className="staff-field">
                  占位提示
                </label>
                <input
                  type="text"
                  value={formData.placeholder}
                  onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                  className=""
                  placeholder="输入提示文字"
                />
              </div>
              {['single_choice', 'multiple_choice'].includes(formData.type) && (
                <div>
                  <label className="staff-field">
                    选项列表
                  </label>
                  <div className="space-y-2">
                    {formData.options.map((opt, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          value={opt.value}
                          onChange={(e) => {
                            const newOptions = [...formData.options]
                            newOptions[idx] = { ...opt, value: e.target.value }
                            setFormData({ ...formData, options: newOptions })
                          }}
                          className=""
                          placeholder="稳定 value"
                        />
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => {
                            const newOptions = [...formData.options]
                            newOptions[idx] = { ...opt, label: e.target.value }
                            setFormData({ ...formData, options: newOptions })
                          }}
                          className=""
                          placeholder={`选项 ${idx + 1}`}
                        />
                        <button
                          onClick={() => {
                            const newOptions = formData.options.filter((_, i) => i !== idx)
                            setFormData({ ...formData, options: newOptions })
                          }}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setFormData({
                          ...formData,
                          options: [...formData.options, { value: formData.contextKey ? '' : String(formData.options.length), label: '' }]
                        })
                      }}
                      className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                    >
                      + 添加选项
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="required"
                  checked={formData.required}
                  onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="required" className="text-sm text-gray-700">
                  必填
                </label>
              </div>
            </div>
            </div>
            <div className="staff-dialog__actions">
              <button
                onClick={() => {
                  setShowFormItemModal(false)
                  resetFormData()
                }}
                className="hui-button hui-button--secondary"
              >
                取消
              </button>
              <button
                onClick={handleAddFormItem}
                className="hui-button hui-button--primary"
              >
                {editingFormItem ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 令牌创建弹窗 */}

    </ProductPage>
  )
}

export default GeneralQuestionnaireEdit
