import { usePageEditorGuard } from '../components/shared-ui/usePageEditorGuard'
import { useLatestRequest, requestError } from '../components/shared-ui/useLatestRequest'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import ModalSurface from '../components/shared-ui/ModalSurface'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../api/client'
import { Save, Plus, Trash2, ChevronLeft, Layers, FileText, Edit3 } from 'lucide-react'
import { ScaleSelector } from '../components/ScaleSelector'
import type { Scale } from '../components/ScaleSelector/types'
import { contextOptionsForKey, contextValueHint } from '../modules/assessment-context/options'
import { ProductButton, ProductStatus } from '../components/product-ui'
import FormSectionManager from '../components/FormSectionManager'

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
  visibility: 'HIDDEN' | 'COURSE' | 'PUBLIC'
  estimatedTime: number | null
  courseQuestionnaires: Array<{
    course: {
      id: string
      title: string
    }
  }>
}

const basicValue = (value: Questionnaire) => ({ code: value.code, name: value.name, description: value.description || '', instruction: value.instruction || '', visibility: value.visibility, estimatedTime: value.estimatedTime })

const QuestionnaireEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const { loading, error: loadError, run: runLoad, invalidate: invalidateLoad } = useLatestRequest(!isNew)
  const { feedback, success, error: showError, info, clear } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'courses'>('basic')

  // 问卷基本信息
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>({
    id: '',
    code: '',
    name: '',
    description: '',
    instruction: '',
    status: 'DRAFT',
    visibility: 'HIDDEN',
    estimatedTime: 30,
    courseQuestionnaires: [],
  })

  // 可用的量表列表
  const [availableScales, setAvailableScales] = useState<Scale[]>([])
  
  // 表单题目列表
  const [formItems, setFormItems] = useState<FormItem[]>([])
  
  // 已关联的量表
  const [questionnaireScales, setQuestionnaireScales] = useState<QuestionnaireScale[]>([])

  // 选中的量表ID列表（用于穿梭框）
  const [selectedScaleIds, setSelectedScaleIds] = useState<string[]>([])

  // 可关联的课程
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; title: string }>>([])
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])

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

  const itemGuard = useEditorGuard({ open: showFormItemModal, value: formData, onClose: () => { setShowFormItemModal(false); resetFormData() } })

  const pageGuard = usePageEditorGuard(basicValue(questionnaire), { dirty: itemGuard.dirty, busy: itemGuard.busy })
  const saving = pageGuard.busy

  useEffect(() => {
    if (!isNew && id) {
      fetchQuestionnaire()
      fetchContent()
    }
    fetchAvailableScales()
    fetchAvailableCourses()
    return invalidateLoad
  }, [id, isNew])

  const fetchQuestionnaire = (preserveBasic = false) => runLoad(async () => {
    const response = await apiClient.get<Questionnaire>(`/questionnaires/${id}`)
    if (response.code !== 0) throw new Error(response.message || '问卷加载失败')
    return response.data
  }, data => {
    if (preserveBasic) setQuestionnaire(current => ({ ...data, ...basicValue(current) }))
    else {
      setQuestionnaire(data)
      pageGuard.reset(basicValue(data))
    }
  }, '问卷加载失败，请重试')

  const fetchContent = async () => {
    try {
      // 并行获取表单题目和量表
      const [formRes, scalesRes] = await Promise.all([
        apiClient.get<{ list: FormItem[] }>(`/questionnaires/${id}/form-items`),
        apiClient.get<{ list: QuestionnaireScale[] }>(`/questionnaires/${id}/scales`),
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

  const fetchAvailableCourses = async () => {
    try {
      const response = await apiClient.get<{ list: Array<{ id: string; title: string }> }>('/courses')
      if (response.code === 0) {
        setAvailableCourses(response.data.list)
      }
    } catch (err) {
      console.error('获取课程列表失败', err)
    }
  }

  const handleSaveBasic = async () => {
    if (!questionnaire.code.trim() || !questionnaire.name.trim()) {
      showError('无法保存', '请填写问卷编码和名称')
      return
    }
    if (!pageGuard.begin()) return
    clear()
    try {
      const response = isNew
        ? await apiClient.post<Questionnaire>('/questionnaires', questionnaire)
        : await apiClient.put<Questionnaire>(`/questionnaires/${id}`, basicValue(questionnaire))
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      setQuestionnaire(response.data)
      pageGuard.reset(basicValue(response.data))
      success('保存成功')
      if (isNew) {
        pageGuard.finish()
        navigate(`/questionnaires/${response.data.id}`)
      }
    } catch (error) {
      showError('保存失败', requestError(error, '保存失败，请重试；修改仍保留在当前页面。'))
    } finally {
      pageGuard.finish()
    }
  }

  // 添加表单题目
  const handleAddFormItem = async () => {
    if (!formData.label) {
      itemGuard.fail('题目标签不能为空')
      return
    }

    if (!itemGuard.begin()) return
    try {
      const dataToSend = {
        ...formData,
        options: ['single_choice', 'multiple_choice'].includes(formData.type) ? formData.options : null,
        contextKey: formData.contextKey || null,
      }
      
      if (editingFormItem) {
        // 更新
        const response = await apiClient.put<FormItem>(
          `/questionnaires/${id}/form-items/${editingFormItem.id}`,
          dataToSend
        )
        if (response.code === 0) {
          fetchContent()
          setShowFormItemModal(false)
          resetFormData()
        } else {
          itemGuard.fail(String(response.message || '保存失败'))
        }
      } else {
        // 新增
        const response = await apiClient.post<FormItem>(
          `/questionnaires/${id}/form-items`,
          dataToSend
        )
        if (response.code === 0) {
          fetchContent()
          setShowFormItemModal(false)
          resetFormData()
        } else {
          itemGuard.fail(String(response.message || '保存失败'))
        }
      }
    } catch (err: any) {
      itemGuard.fail(String(err.message || '操作失败'))
    } finally {
      itemGuard.finish()
    }
  }

  // 删除表单题目
  const handleRemoveFormItem = async (itemId: string) => {
    if (!confirm('确定要删除此表单题目吗？')) return
    
    try {
      const response = await apiClient.delete(`/questionnaires/${id}/form-items/${itemId}`)
      if (response.code === 0) {
        setFormItems(formItems.filter(fi => fi.id !== itemId))
      } else {
        showMessage(response.message)
      }
    } catch (err: any) {
      showMessage(err.message || '删除失败')
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

  // 添加量表
  const handleAddScale = async (scaleId: string, position: number) => {
    try {
      const response = await apiClient.post(`/questionnaires/${id}/scales`, {
        scaleId,
        position,
      })
      if (response.code === 0) {
        fetchContent()
      } else {
        showMessage(response.message)
      }
    } catch (err: any) {
      showMessage(err.message || '添加失败')
    }
  }

  // 处理量表选择变化（穿梭框）
  const handleScaleChange = async (newSelectedIds: string[]) => {
    const added = newSelectedIds.filter(id => !selectedScaleIds.includes(id))
    const removed = selectedScaleIds.filter(id => !newSelectedIds.includes(id))

    // 添加新量表
    for (const scaleId of added) {
      await handleAddScale(scaleId, questionnaireScales.length + formItems.length)
    }

    // 移除量表
    for (const scaleId of removed) {
      await handleRemoveScale(scaleId)
    }

    setSelectedScaleIds(newSelectedIds)
  }

  const handleRemoveScale = async (scaleId: string) => {
    try {
      const response = await apiClient.delete(`/questionnaires/${id}/scales/${scaleId}`)
      if (response.code === 0) {
        setQuestionnaireScales(questionnaireScales.filter(qs => qs.scaleId !== scaleId))
      } else {
        showMessage(response.message)
      }
    } catch (err: any) {
      showMessage(err.message || '移除失败')
    }
  }

  const handleAddCourses = async () => {
    if (selectedCourses.length === 0) return

    try {
      const response = await apiClient.post(`/questionnaires/${id}/courses`, {
        courseIds: selectedCourses,
      })
      if (response.code === 0) {
        fetchQuestionnaire(true)
        setSelectedCourses([])
      } else {
        showMessage(response.message)
      }
    } catch (err: any) {
      showMessage(err.message || '添加失败')
    }
  }

  const handleRemoveCourse = async (courseId: string) => {
    try {
      const response = await apiClient.delete(`/questionnaires/${id}/courses/${courseId}`)
      if (response.code === 0) {
        setQuestionnaire(current => ({
          ...current,
          courseQuestionnaires: current.courseQuestionnaires.filter(
            cq => cq.course.id !== courseId
          ),
        }))
      }
    } catch (err: any) {
      showMessage(err.message || '移除失败')
    }
  }

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fill_blank':
        return '填空题'
      case 'single_choice':
        return '单选题'
      case 'multiple_choice':
        return '多选题'
      case 'text_input':
        return '文本输入'
      case 'year_month':
        return '年月选择'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (loadError) return <ProductStatus kind="error" title="问卷加载失败" announce="assertive" actions={<ProductButton onClick={() => void fetchQuestionnaire(questionnaire.id === id)}>重试</ProductButton>}>{loadError}</ProductStatus>

  // 合并所有内容项并排序
  const allContentItems: ContentItem[] = [
    ...formItems.map(fi => ({ type: 'form' as const, id: fi.id, position: fi.position, data: fi })),
    ...questionnaireScales.map(qs => ({ type: 'scale' as const, id: qs.id, position: qs.position, data: qs })),
  ].sort((a, b) => a.position - b.position)

  return (
    <div className="p-6">
      {feedback}
      <fieldset disabled={saving} className="min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/questionnaires" className="text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? '创建历史问卷' : '编辑历史问卷'}
          </h1>
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
        {activeTab === 'basic' && (
          <button
            onClick={handleSaveBasic}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-action text-white rounded-lg hover:bg-action/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          {[
            { key: 'basic', label: '基本信息' },
            { key: 'content', label: '内容编排' },
            { key: 'courses', label: '课程关联' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              disabled={isNew && tab.key !== 'basic'}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-action text-action'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${(isNew && tab.key !== 'basic') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Basic Info Tab */}
      {activeTab === 'basic' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="QuestionnaireEdit-field-101" className="block text-sm font-medium text-gray-700 mb-1">
                问卷编码 *
              </label>
              <input id="QuestionnaireEdit-field-101"
                type="text"
                value={questionnaire.code}
                onChange={(e) => setQuestionnaire({ ...questionnaire, code: e.target.value })}
                disabled={!isNew}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action disabled:bg-gray-100"
                placeholder="如: mental-health-composite"
              />
            </div>
            <div>
              <label htmlFor="QuestionnaireEdit-field-102" className="block text-sm font-medium text-gray-700 mb-1">
                问卷名称 *
              </label>
              <input id="QuestionnaireEdit-field-102"
                type="text"
                value={questionnaire.name}
                onChange={(e) => setQuestionnaire({ ...questionnaire, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action"
                placeholder="如: 心理健康综合评估"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="QuestionnaireEdit-field-103" className="block text-sm font-medium text-gray-700 mb-1">
                问卷描述
              </label>
              <textarea id="QuestionnaireEdit-field-103"
                value={questionnaire.description || ''}
                onChange={(e) => setQuestionnaire({ ...questionnaire, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action"
                placeholder="简要描述问卷的用途和特点"
              />
            </div>
            <div>
              <label htmlFor="QuestionnaireEdit-field-104" className="block text-sm font-medium text-gray-700 mb-1">
                预计用时（分钟）
              </label>
              <input id="QuestionnaireEdit-field-104"
                type="number"
                value={questionnaire.estimatedTime || ''}
                onChange={(e) =>
                  setQuestionnaire({ ...questionnaire, estimatedTime: parseInt(e.target.value) || null })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action"
              />
            </div>
            <div>
              <label htmlFor="QuestionnaireEdit-field-105" className="block text-sm font-medium text-gray-700 mb-1">
                可见性设置 *
              </label>
              <select id="QuestionnaireEdit-field-105"
                value={questionnaire.visibility}
                onChange={(e) => setQuestionnaire({ ...questionnaire, visibility: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action"
              >
                <option value="HIDDEN">未关联不可见</option>
                <option value="COURSE">关联课程后可见</option>
                <option value="PUBLIC">全体可见</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {questionnaire.visibility === 'HIDDEN' && '问卷不会对学生显示，需要先关联课程'}
                {questionnaire.visibility === 'COURSE' && '只有关联课程的学生可以看到'}
                {questionnaire.visibility === 'PUBLIC' && '所有学生都可以看到此问卷'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="QuestionnaireEdit-field-106" className="block text-sm font-medium text-gray-700 mb-1">
                指导语
              </label>
              <textarea id="QuestionnaireEdit-field-106"
                value={questionnaire.instruction || ''}
                onChange={(e) => setQuestionnaire({ ...questionnaire, instruction: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-action focus:border-action"
                placeholder="指导用户如何作答..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* 量表选择（使用穿梭框） */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">选择量表</h3>
            <ScaleSelector
              scales={availableScales}
              selected={selectedScaleIds}
              onChange={handleScaleChange}
              loading={false}
            />
          </div>

          {/* 操作按钮 */}
          <div className="bg-white rounded-lg shadow p-4">
            <button
              onClick={() => {
                resetFormData()
                setShowFormItemModal(true)
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              添加表单题目
            </button>
          </div>

          {/* 内容列表 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">问卷内容</h3>
            <p className="mb-3 text-xs text-gray-500">量表与表单区段的统一顺序请在下方“表单区段”管理器中调整；这里仅编辑或移除内容。</p>
            {allContentItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>暂无内容</p>
                <p className="text-sm mt-2">请添加表单题目或量表</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allContentItems.map((item, index) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 group"
                  >
                    <div className="flex items-center gap-3">
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
                              handleRemoveScale((item.data as QuestionnaireScale).scaleId)
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
          {!isNew && id && (
            <FormSectionManager
              basePath={`/questionnaires/${id}`}
              readOnly={questionnaire.status === 'PUBLISHED'}
            />
          )}
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">添加课程关联</h3>
            <div className="flex gap-4">
              <select
                multiple
                value={selectedCourses}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value)
                  setSelectedCourses(values)
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md h-32"
              >
                {availableCourses
                  .filter(c => !questionnaire.courseQuestionnaires.some(cq => cq.course.id === c.id))
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleAddCourses}
                disabled={selectedCourses.length === 0}
                className="px-4 py-2 bg-action text-white rounded-md hover:bg-action/90 disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>

          {/* Linked Courses */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">已关联课程</h3>
            {questionnaire.courseQuestionnaires.length === 0 ? (
              <p className="text-gray-500">未关联任何课程</p>
            ) : (
              <div className="space-y-2">
                {questionnaire.courseQuestionnaires.map((cq) => (
                  <div key={cq.course.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-900">{cq.course.title}</span>
                    <button
                      onClick={() => handleRemoveCourse(cq.course.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 表单题目编辑弹窗 */}
      {showFormItemModal && (
        <ModalSurface open onClose={itemGuard.close} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" tabIndex={-1} role="dialog" aria-modal="true" aria-label={editingFormItem ? "编辑表单题目" : "添加表单题目"}>{itemGuard.error}<fieldset disabled={itemGuard.busy} className="contents">
            <h3 className="text-lg font-medium mb-4">
              {editingFormItem ? '编辑表单题目' : '添加表单题目'}
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="QuestionnaireEdit-field-107" className="block text-sm font-medium text-gray-700 mb-1">
                  题目类型 *
                </label>
                <select id="QuestionnaireEdit-field-107"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="fill_blank">填空题（短文本）</option>
                  <option value="single_choice">单选题</option>
                  <option value="multiple_choice">多选题</option>
                  <option value="text_input">文本输入（长文本）</option>
                  <option value="year_month">年月选择</option>
                </select>
              </div>
              <div>
                <label htmlFor="QuestionnaireEdit-field-108" className="block text-sm font-medium text-gray-700 mb-1">
                  用于测评参考
                </label>
                <select id="QuestionnaireEdit-field-108"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                <label htmlFor="QuestionnaireEdit-field-109" className="block text-sm font-medium text-gray-700 mb-1">
                  题目标签 *
                </label>
                <input id="QuestionnaireEdit-field-109"
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="如：性别、年龄、意见反馈"
                />
              </div>
              <div>
                <label htmlFor="QuestionnaireEdit-field-110" className="block text-sm font-medium text-gray-700 mb-1">
                  占位提示
                </label>
                <input id="QuestionnaireEdit-field-110"
                  type="text"
                  value={formData.placeholder}
                  onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="输入提示文字"
                />
              </div>
              {['single_choice', 'multiple_choice'].includes(formData.type) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          className="w-36 px-3 py-2 border border-gray-300 rounded-md"
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
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
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
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={itemGuard.close}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                取消
              </button>
              <button
                onClick={handleAddFormItem}
                className="px-4 py-2 bg-action text-white rounded-md hover:bg-action/90"
              >
                {editingFormItem ? '保存' : '添加'}
              </button>
            </div>
          </fieldset></div>
        </ModalSurface>
      )}
      {itemGuard.confirmation}
      </fieldset>
      {pageGuard.confirmation}
    </div>
  )
}

export default QuestionnaireEdit
