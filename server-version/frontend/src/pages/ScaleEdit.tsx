import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../api/client'
import { Save, Plus, Trash2, ChevronLeft, GripVertical } from 'lucide-react'
import TagInput from '../components/TagInput'
import { completeScaleLabels } from '../utils/scaleLabels'

interface Dimension {
  id: string
  code: string
  name: string
  description: string | null
  scoringMethod: string
  weight: number
  minScore: number | null
  maxScore: number | null
  _count?: {
    itemDimensions: number
  }
  levelFeedback?: LevelFeedback
}

// 等级反馈配置
interface LevelConfig {
  name: string
  min: number
  max: number
  interpretation: string
  suggestions: string[]
}

interface LevelFeedback {
  levels: LevelConfig[]
}

interface ScaleItem {
  id: string
  itemCode: string
  content: string
  type: string
  reverse: boolean
  required: boolean
  weight: number
  sortOrder: number
  options: Array<{ value: number; label: string }> | null
  itemDimensions: Array<{
    dimensionId: string
    weight: number
    reverse: boolean
    dimension: {
      id: string
      code: string
      name: string
    }
  }>
}

interface ScaleLabel {
  value: number
  label: string
}

// 默认选项模板
const DEFAULT_LABELS: Record<number, ScaleLabel[]> = {
  2: [
    { value: 1, label: '否' },
    { value: 2, label: '是' },
  ],
  3: [
    { value: 1, label: '不同意' },
    { value: 2, label: '一般' },
    { value: 3, label: '同意' },
  ],
  4: [
    { value: 1, label: '非常不同意' },
    { value: 2, label: '不同意' },
    { value: 3, label: '同意' },
    { value: 4, label: '非常同意' },
  ],
  5: [
    { value: 1, label: '非常不同意' },
    { value: 2, label: '不同意' },
    { value: 3, label: '一般' },
    { value: 4, label: '同意' },
    { value: 5, label: '非常同意' },
  ],
  6: [
    { value: 1, label: '完全不同意' },
    { value: 2, label: '不同意' },
    { value: 3, label: '稍微不同意' },
    { value: 4, label: '稍微同意' },
    { value: 5, label: '同意' },
    { value: 6, label: '完全同意' },
  ],
  7: [
    { value: 1, label: '完全不同意' },
    { value: 2, label: '不同意' },
    { value: 3, label: '稍微不同意' },
    { value: 4, label: '一般' },
    { value: 5, label: '稍微同意' },
    { value: 6, label: '同意' },
    { value: 7, label: '完全同意' },
  ],
}

// 生成默认选项
const generateDefaultLabels = (points: number): ScaleLabel[] => {
  if (DEFAULT_LABELS[points]) {
    return DEFAULT_LABELS[points]
  }
  // 8-10 点量表使用自动生成的数字标签
  return Array.from({ length: points }, (_, i) => ({
    value: i + 1,
    label: `选项${i + 1}`,
  }))
}

interface Scale {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  visibility: 'HIDDEN' | 'COURSE' | 'PUBLIC'
  config: {
    points?: number
    labels?: ScaleLabel[]
    randomizeItems?: boolean
  } | null
  estimatedTime: number | null
  instruction: string | null
  tags?: string[]
  courseScales?: Array<{
    course: {
      id: string
      title: string
    }
  }>
}

const ScaleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'dimensions' | 'items' | 'feedback'>('basic')

  // 反馈配置状态
  const [feedbackDimensionId, setFeedbackDimensionId] = useState<string>('')
  const [levelFeedback, setLevelFeedback] = useState<LevelFeedback>({ levels: [] })
  const [savingFeedback, setSavingFeedback] = useState(false)

  // 量表基本信息
  const [scale, setScale] = useState<Scale>({
    id: '',
    code: '',
    name: '',
    description: '',
    status: 'DRAFT',
    visibility: 'HIDDEN',
    config: {
      points: 5,
      labels: DEFAULT_LABELS[5],
      randomizeItems: false,
    },
    estimatedTime: 15,
    instruction: '',
    tags: [],
    courseScales: [],
  })

  // 可关联的课程列表
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; title: string }>>([])
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])

  // 维度列表
  const [dimensions, setDimensions] = useState<Dimension[]>([])
  const [newDimension, setNewDimension] = useState({
    code: '',
    name: '',
    description: '',
    scoringMethod: 'sum',
    minScore: null as number | null,
    maxScore: null as number | null,
  })
  const [editingDimension, setEditingDimension] = useState<Dimension | null>(null)
  const [showDimensionModal, setShowDimensionModal] = useState(false)

  // 题目列表
  const [items, setItems] = useState<ScaleItem[]>([])
  const [editingItem, setEditingItem] = useState<ScaleItem | null>(null)
  const [showItemModal, setShowItemModal] = useState(false)

  // 批量输入题目
  const [batchItemsText, setBatchItemsText] = useState('')
  const [showBatchInput, setShowBatchInput] = useState(false)

  useEffect(() => {
    if (!isNew && id) {
      fetchScale()
      fetchDimensions()
      fetchItems()
    }
    fetchAvailableCourses()
  }, [id, isNew])

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

  const fetchScale = async () => {
    try {
      const response = await apiClient.get<Scale>(`/scales/${id}`)
      if (response.code === 0) {
        const loaded = response.data
        const points = loaded.config?.points || 5
        setScale({
          ...loaded,
          config: {
            ...loaded.config,
            points,
            labels: completeScaleLabels(points, loaded.config?.labels),
          },
        })
      }
    } catch (err) {
      console.error('获取量表信息失败', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchDimensions = async () => {
    try {
      const response = await apiClient.get<{ list: Dimension[] }>(`/scales/${id}/dimensions`)
      if (response.code === 0) {
        setDimensions(response.data.list)
      }
    } catch (err) {
      console.error('获取维度列表失败', err)
    }
  }

  const fetchItems = async () => {
    try {
      const response = await apiClient.get<{ list: ScaleItem[] }>(`/scales/${id}/items`)
      if (response.code === 0) {
        setItems(response.data.list)
      }
    } catch (err) {
      console.error('获取题目列表失败', err)
    }
  }

  // 课程关联处理
  const handleAddCourse = async () => {
    if (!selectedCourses[0] || !scale.id) return

    try {
      const response = await apiClient.post(`/scales/${scale.id}/courses`, {
        courseIds: selectedCourses,
      })
      if (response.code === 0) {
        // 刷新量表信息
        fetchScale()
        setSelectedCourses([])
      } else {
        alert(response.message || '添加关联失败')
      }
    } catch (err) {
      console.error('添加课程关联失败', err)
      alert('添加关联失败')
    }
  }

  const handleRemoveCourse = async (courseId: string) => {
    if (!scale.id) return

    try {
      const response = await apiClient.delete(`/scales/${scale.id}/courses/${courseId}`)
      if (response.code === 0) {
        // 更新本地状态
        setScale({
          ...scale,
          courseScales: scale.courseScales?.filter((cs) => cs.course.id !== courseId),
        })
      } else {
        alert(response.message || '取消关联失败')
      }
    } catch (err) {
      console.error('取消课程关联失败', err)
      alert('取消关联失败')
    }
  }

  const handleSaveBasic = async () => {
    if (!scale.code || !scale.name) {
      alert('量表编码和名称不能为空')
      return
    }

    try {
      setSaving(true)
      if (isNew) {
        const response = await apiClient.post<Scale>('/scales', scale)
        if (response.code === 0) {
          navigate(`/scales/${response.data.id}`)
        } else {
          alert(response.message)
        }
      } else {
        const response = await apiClient.put<Scale>(`/scales/${id}`, {
          name: scale.name,
          description: scale.description,
          visibility: scale.visibility,
          estimatedTime: scale.estimatedTime,
          instruction: scale.instruction,
          config: {
            ...scale.config,
            points: scale.config?.points || 5,
            labels: completeScaleLabels(scale.config?.points, scale.config?.labels),
          },
          tags: scale.tags || [],
        })
        if (response.code === 0) {
          const points = response.data.config?.points || 5
          setScale({
            ...response.data,
            config: {
              ...response.data.config,
              points,
              labels: completeScaleLabels(points, response.data.config?.labels),
            },
          })
          alert('保存成功')
        } else {
          alert(response.message)
        }
      }
    } catch (err: any) {
      alert(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAddDimension = async () => {
    if (!newDimension.code || !newDimension.name) {
      alert('维度编码和名称不能为空')
      return
    }

    try {
      const response = await apiClient.post<Dimension>(`/scales/${id}/dimensions`, {
        code: newDimension.code,
        name: newDimension.name,
        description: newDimension.description,
        scoringMethod: newDimension.scoringMethod,
        minScore: newDimension.minScore,
        maxScore: newDimension.maxScore,
      })
      if (response.code === 0) {
        setDimensions([...dimensions, response.data])
        setNewDimension({ code: '', name: '', description: '', scoringMethod: 'sum', minScore: null, maxScore: null })
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '添加维度失败')
    }
  }

  const handleUpdateDimension = async () => {
    if (!editingDimension) return

    try {
      const response = await apiClient.put<Dimension>(
        `/scales/${id}/dimensions/${editingDimension.id}`,
        {
          name: editingDimension.name,
          description: editingDimension.description,
          scoringMethod: editingDimension.scoringMethod,
          minScore: editingDimension.minScore,
          maxScore: editingDimension.maxScore,
        }
      )
      if (response.code === 0) {
        setDimensions(dimensions.map(d => d.id === editingDimension.id ? response.data : d))
        setShowDimensionModal(false)
        setEditingDimension(null)
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '更新维度失败')
    }
  }

  const handleDeleteDimension = async (dimensionId: string) => {
    if (!confirm('确定要删除此维度吗？')) return

    try {
      const response = await apiClient.delete(`/scales/${id}/dimensions/${dimensionId}`)
      if (response.code === 0) {
        setDimensions(dimensions.filter((d) => d.id !== dimensionId))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除维度失败')
    }
  }

  const handleAddItem = () => {
    setEditingItem({
      id: '',
      itemCode: `Q${items.length + 1}`,
      content: '',
      type: 'single',
      reverse: false,
      required: true,
      weight: 1,
      sortOrder: items.length + 1,
      options: null, // 选项从量表配置获取，题目不再单独存储
      itemDimensions: [],
    })
    setShowItemModal(true)
  }

  // 批量添加题目
  const handleBatchAddItems = async () => {
    if (!batchItemsText.trim()) {
      alert('请输入题目内容')
      return
    }

    // 按行分割，过滤空行
    const lines = batchItemsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      alert('没有有效的题目内容')
      return
    }

    try {
      // 批量创建题目
      let successCount = 0
      for (let i = 0; i < lines.length; i++) {
        const payload = {
          itemCode: `Q${items.length + successCount + 1}`,
          content: lines[i],
          type: 'single',
          reverse: false,
          required: true,
          weight: 1,
          options: null,
          dimensions: [],
        }

        const response = await apiClient.post<ScaleItem>(`/scales/${id}/items`, payload)
        if (response.code === 0) {
          successCount++
        }
      }

      if (successCount > 0) {
        // 重新获取题目列表
        fetchItems()
        setBatchItemsText('')
        setShowBatchInput(false)
        alert(`成功添加 ${successCount} 道题目`)
      }
    } catch (err: any) {
      alert(err.message || '批量添加失败')
    }
  }

  // 更新题目的维度关联
  const handleToggleItemDimension = async (
    itemId: string,
    dimensionId: string,
    checked: boolean
  ) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return

    let newItemDimensions = [...item.itemDimensions]

    if (checked) {
      // 添加维度关联
      const dim = dimensions.find((d) => d.id === dimensionId)
      if (dim) {
        newItemDimensions.push({
          dimensionId,
          weight: 1,
          reverse: false,
          dimension: { id: dim.id, code: dim.code, name: dim.name },
        })
      }
    } else {
      // 移除维度关联
      newItemDimensions = newItemDimensions.filter((d) => d.dimensionId !== dimensionId)
    }

    try {
      const response = await apiClient.put<ScaleItem>(`/scales/${id}/items/${itemId}`, {
        itemCode: item.itemCode,
        content: item.content,
        type: item.type,
        reverse: item.reverse,
        required: item.required,
        weight: item.weight,
        options: item.options,
        dimensions: newItemDimensions.map((d) => ({
          dimensionId: d.dimensionId,
          weight: d.weight,
          reverse: d.reverse,
        })),
      })

      if (response.code === 0) {
        setItems(items.map((i) => (i.id === itemId ? response.data : i)))
      }
    } catch (err: any) {
      console.error('更新维度关联失败', err)
    }
  }

  // 切换题目反向计分
  const handleToggleReverse = async (itemId: string, reverse: boolean) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return

    try {
      const response = await apiClient.put<ScaleItem>(`/scales/${id}/items/${itemId}`, {
        itemCode: item.itemCode,
        content: item.content,
        type: item.type,
        reverse: reverse,
        required: item.required,
        weight: item.weight,
        options: item.options,
        dimensions: item.itemDimensions.map((d) => ({
          dimensionId: d.dimensionId,
          weight: d.weight,
          reverse: d.reverse,
        })),
      })

      if (response.code === 0) {
        setItems(items.map((i) => (i.id === itemId ? response.data : i)))
      }
    } catch (err: any) {
      console.error('更新反向计分失败', err)
    }
  }

  const handleSaveItem = async () => {
    if (!editingItem?.content) {
      alert('题目内容不能为空')
      return
    }

    try {
      const payload = {
        itemCode: editingItem.itemCode,
        content: editingItem.content,
        type: editingItem.type,
        reverse: editingItem.reverse,
        required: editingItem.required,
        weight: editingItem.weight,
        options: editingItem.options,
        dimensions: editingItem.itemDimensions.map((d) => ({
          dimensionId: d.dimensionId,
          weight: d.weight,
          reverse: d.reverse,
        })),
      }

      if (editingItem.id) {
        const response = await apiClient.put<ScaleItem>(
          `/scales/${id}/items/${editingItem.id}`,
          payload
        )
        if (response.code === 0) {
          setItems(items.map((i) => (i.id === editingItem.id ? response.data : i)))
          setShowItemModal(false)
        } else {
          alert(response.message)
        }
      } else {
        const response = await apiClient.post<ScaleItem>(`/scales/${id}/items`, payload)
        if (response.code === 0) {
          setItems([...items, response.data])
          setShowItemModal(false)
        } else {
          alert(response.message)
        }
      }
    } catch (err: any) {
      alert(err.message || '保存题目失败')
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('确定要删除此题目吗？')) return

    try {
      const response = await apiClient.delete(`/scales/${id}/items/${itemId}`)
      if (response.code === 0) {
        setItems(items.filter((i) => i.id !== itemId))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除题目失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/scales" className="text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? '创建量表' : '编辑量表'}
          </h1>
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              scale.status === 'PUBLISHED'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {scale.status === 'PUBLISHED' ? '已发布' : '草稿'}
          </span>
        </div>
        {activeTab === 'basic' && (
          <button
            onClick={handleSaveBasic}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
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
            { key: 'dimensions', label: '维度管理' },
            { key: 'items', label: '题目管理' },
            { key: 'feedback', label: '反馈配置' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              disabled={isNew && tab.key !== 'basic'}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                量表编码 *
              </label>
              <input
                type="text"
                value={scale.code}
                onChange={(e) => setScale({ ...scale, code: e.target.value })}
                disabled={!isNew}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary disabled:bg-gray-100"
                placeholder="如: big-five-personality"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                量表名称 *
              </label>
              <input
                type="text"
                value={scale.name}
                onChange={(e) => setScale({ ...scale, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                placeholder="如: 大五人格量表"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                量表描述
              </label>
              <textarea
                value={scale.description || ''}
                onChange={(e) => setScale({ ...scale, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                placeholder="简要描述量表的用途和特点"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                预计用时（分钟）
              </label>
              <input
                type="number"
                value={scale.estimatedTime || ''}
                onChange={(e) =>
                  setScale({ ...scale, estimatedTime: parseInt(e.target.value) || null })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                可见性设置 *
              </label>
              <select
                value={scale.visibility}
                onChange={(e) => setScale({ ...scale, visibility: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              >
                <option value="HIDDEN">未关联不可见</option>
                <option value="COURSE">关联课程后可见</option>
                <option value="PUBLIC">全体可见</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {scale.visibility === 'HIDDEN' && '量表不会对学生显示，需要先关联课程'}
                {scale.visibility === 'COURSE' && '只有关联课程的学生可以看到'}
                {scale.visibility === 'PUBLIC' && '所有学生都可以看到此量表'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                标签
              </label>
              <TagInput
                value={scale.tags || []}
                onChange={(tags) => setScale({ ...scale, tags })}
                maxTags={10}
                maxLength={20}
                placeholder="输入标签后按回车添加"
              />
            </div>
            {scale.visibility === 'COURSE' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  关联课程
                </label>
                <div className="border border-gray-300 rounded-md p-3">
                  {scale.courseScales && scale.courseScales.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-500 mb-1">已关联课程：</p>
                      <div className="flex flex-wrap gap-2">
                        {scale.courseScales.map((cs, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {cs.course.title}
                            <button
                              type="button"
                              onClick={() => handleRemoveCourse(cs.course.id)}
                              className="ml-1 text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <select
                      value={selectedCourses[0] || ''}
                      onChange={(e) => setSelectedCourses([e.target.value])}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">选择要关联的课程...</option>
                      {availableCourses
                        .filter(
                          (c) =>
                            !scale.courseScales?.some((cs) => cs.course.id === c.id)
                        )
                        .map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddCourse}
                      disabled={!selectedCourses[0]}
                      className="px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                量表点数
              </label>
              <input
                type="number"
                min={2}
                max={10}
                value={scale.config?.points || 5}
                onChange={(e) => {
                  const newPoints = Math.min(10, Math.max(2, parseInt(e.target.value) || 5))
                  setScale({
                    ...scale,
                    config: {
                      ...scale.config,
                      points: newPoints,
                      labels: completeScaleLabels(newPoints, scale.config?.labels),
                    },
                  })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
              <p className="mt-1 text-xs text-gray-500">
                2–10 点。档位必须连续为 1 到 N，不能跳过。改点数会补齐或去掉最高档，已填写的文字会保留。
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                档位文字
              </label>
              <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
                <div className="space-y-2">
                  {completeScaleLabels(scale.config?.points, scale.config?.labels).map((opt, idx) => (
                    <div key={opt.value} className="flex items-center gap-3">
                      <span className="w-8 h-8 flex items-center justify-center bg-primary text-white text-sm rounded-full">
                        {opt.value}
                      </span>
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const points = scale.config?.points || 5
                          const newLabels = completeScaleLabels(points, scale.config?.labels)
                          newLabels[idx] = { ...opt, label: e.target.value }
                          setScale({
                            ...scale,
                            config: {
                              ...scale.config,
                              points,
                              labels: newLabels,
                            },
                          })
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder={`第 ${opt.value} 档的文字，如「不同意」`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  每一档学生都能选择。分值固定为 1 到 {scale.config?.points || 5}，只需改文字。
                </p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                指导语
              </label>
              <textarea
                value={scale.instruction || ''}
                onChange={(e) => setScale({ ...scale, instruction: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                placeholder="指导用户如何作答..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Dimensions Tab */}
      {activeTab === 'dimensions' && (
        <div className="space-y-6">
          {/* Add Dimension Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">添加维度</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={newDimension.code}
                onChange={(e) => setNewDimension({ ...newDimension, code: e.target.value })}
                placeholder="维度编码（如: extraversion）"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
              <input
                type="text"
                value={newDimension.name}
                onChange={(e) => setNewDimension({ ...newDimension, name: e.target.value })}
                placeholder="维度名称（如: 外向性）"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
              <input
                type="text"
                value={newDimension.description || ''}
                onChange={(e) =>
                  setNewDimension({ ...newDimension, description: e.target.value })
                }
                placeholder="维度描述"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-500">分数区间:</span>
                <input
                  type="number"
                  value={newDimension.minScore ?? ''}
                  onChange={(e) => setNewDimension({ ...newDimension, minScore: e.target.value ? Number(e.target.value) : null })}
                  placeholder="最低分"
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                />
                <span>-</span>
                <input
                  type="number"
                  value={newDimension.maxScore ?? ''}
                  onChange={(e) => setNewDimension({ ...newDimension, maxScore: e.target.value ? Number(e.target.value) : null })}
                  placeholder="最高分"
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  onClick={handleAddDimension}
                  className="flex items-center justify-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              分数区间可选。如不设置，系统将根据题目数量和选项分值自动计算理论分数区间。
            </p>
          </div>

          {/* Dimensions List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    编码
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    描述
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    分数区间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    计分方式
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    关联题目数
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dimensions.map((dim) => (
                  <tr key={dim.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">{dim.code}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{dim.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{dim.description || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {dim.minScore !== null && dim.maxScore !== null
                        ? `${dim.minScore} - ${dim.maxScore}`
                        : '自动计算'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {dim.scoringMethod === 'sum' ? '求和' : '平均'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {dim._count?.itemDimensions || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingDimension(dim)
                            setShowDimensionModal(true)
                          }}
                          className="text-primary hover:text-primary/80"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteDimension(dim.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {dimensions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      暂无维度，请先添加维度
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setShowBatchInput(!showBatchInput)}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                批量添加
              </button>
              <button
                onClick={handleAddItem}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                单个添加
              </button>
            </div>
          </div>

          {/* 批量输入区域 */}
          {showBatchInput && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium mb-4">批量添加题目</h3>
              <p className="text-sm text-gray-500 mb-4">
                每行输入一个题目内容，提交后将批量创建题目。创建后可在下方表格中编辑维度和反向计分。
              </p>
              <textarea
                value={batchItemsText}
                onChange={(e) => setBatchItemsText(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary font-mono text-sm"
                placeholder="请输入题目内容，每行一个题目，例如：&#10;我经常感到快乐&#10;我容易与他人建立联系&#10;我喜欢尝试新事物&#10;我经常感到焦虑"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowBatchInput(false)
                    setBatchItemsText('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchAddItems}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  批量创建题目
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    题目内容
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    关联维度
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                    反向计分
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{item.content}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {dimensions.map((dim) => {
                          const isLinked = item.itemDimensions.some(
                            (d) => d.dimensionId === dim.id
                          )
                          return (
                            <label
                              key={dim.id}
                              className={`inline-flex items-center px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                isLinked
                                  ? 'bg-primary text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isLinked}
                                onChange={(e) =>
                                  handleToggleItemDimension(item.id, dim.id, e.target.checked)
                                }
                                className="sr-only"
                              />
                              {dim.name}
                            </label>
                          )
                        })}
                        {dimensions.length === 0 && (
                          <span className="text-xs text-gray-400">请先添加维度</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.reverse}
                          onChange={(e) => handleToggleReverse(item.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item)
                          setShowItemModal(true)
                        }}
                        className="text-primary hover:text-primary/80"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      暂无题目，请先添加题目
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback Config Tab */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* 维度选择 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">选择维度</h3>
            {dimensions.length === 0 ? (
              <p className="text-gray-500">请先在"维度管理"中创建维度</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dimensions.map((dim) => (
                  <button
                    key={dim.id}
                    onClick={() => {
                      setFeedbackDimensionId(dim.id)
                      setLevelFeedback(dim.levelFeedback || { levels: [] })
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      feedbackDimensionId === dim.id
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {dim.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 等级配置 */}
          {feedbackDimensionId && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">等级配置</h3>
                <button
                  onClick={() => {
                    setLevelFeedback({
                      ...levelFeedback,
                      levels: [
                        ...levelFeedback.levels,
                        {
                          name: `等级${levelFeedback.levels.length + 1}`,
                          min: 0,
                          max: 10,
                          interpretation: '',
                          suggestions: []
                        }
                      ]
                    })
                  }}
                  className="flex items-center px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加等级
                </button>
              </div>

              {/* 等级列表 */}
              <div className="space-y-4">
                {levelFeedback.levels.map((level, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="text"
                          value={level.name}
                          onChange={(e) => {
                            const newLevels = [...levelFeedback.levels]
                            newLevels[index] = { ...level, name: e.target.value }
                            setLevelFeedback({ ...levelFeedback, levels: newLevels })
                          }}
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium w-32"
                          placeholder="等级名称"
                        />
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>分数区间:</span>
                          <input
                            type="number"
                            value={level.min}
                            onChange={(e) => {
                              const newLevels = [...levelFeedback.levels]
                              newLevels[index] = { ...level, min: Number(e.target.value) }
                              setLevelFeedback({ ...levelFeedback, levels: newLevels })
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-md"
                          />
                          <span>-</span>
                          <input
                            type="number"
                            value={level.max}
                            onChange={(e) => {
                              const newLevels = [...levelFeedback.levels]
                              newLevels[index] = { ...level, max: Number(e.target.value) }
                              setLevelFeedback({ ...levelFeedback, levels: newLevels })
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-md"
                          />
                          <span>分</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const newLevels = levelFeedback.levels.filter((_, i) => i !== index)
                          setLevelFeedback({ ...levelFeedback, levels: newLevels })
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          得分解读
                        </label>
                        <textarea
                          value={level.interpretation}
                          onChange={(e) => {
                            const newLevels = [...levelFeedback.levels]
                            newLevels[index] = { ...level, interpretation: e.target.value }
                            setLevelFeedback({ ...levelFeedback, levels: newLevels })
                          }}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          placeholder="该等级的解读文本，可使用 {{dimensionName}} 占位符"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          建议 (每行一条)
                        </label>
                        <textarea
                          value={level.suggestions.join('\n')}
                          onChange={(e) => {
                            const newLevels = [...levelFeedback.levels]
                            newLevels[index] = { 
                              ...level, 
                              suggestions: e.target.value.split('\n').filter(s => s.trim()) 
                            }
                            setLevelFeedback({ ...levelFeedback, levels: newLevels })
                          }}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          placeholder="建议1&#10;建议2&#10;建议3"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {levelFeedback.levels.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    点击"添加等级"按钮创建等级配置
                  </p>
                )}
              </div>

              {/* 保存按钮 */}
              <div className="flex justify-end mt-6">
                <button
                  onClick={async () => {
                    if (!feedbackDimensionId) return
                    setSavingFeedback(true)
                    try {
                      const response = await apiClient.put(
                        `/scales/${id}/dimensions/${feedbackDimensionId}/feedback`,
                        { levelFeedback }
                      )
                      if (response.code === 0) {
                        // 更新本地维度数据
                        setDimensions(dimensions.map(d => 
                          d.id === feedbackDimensionId 
                            ? { ...d, levelFeedback }
                            : d
                        ))
                        alert('保存成功')
                      } else {
                        alert(response.message || '保存失败')
                      }
                    } catch (err: any) {
                      alert(err.message || '保存失败')
                    } finally {
                      setSavingFeedback(false)
                    }
                  }}
                  disabled={savingFeedback}
                  className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {savingFeedback ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dimension Edit Modal */}
      {showDimensionModal && editingDimension && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">编辑维度</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    维度编码
                  </label>
                  <input
                    type="text"
                    value={editingDimension.code}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    维度名称 *
                  </label>
                  <input
                    type="text"
                    value={editingDimension.name}
                    onChange={(e) =>
                      setEditingDimension({ ...editingDimension, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    维度描述
                  </label>
                  <textarea
                    value={editingDimension.description || ''}
                    onChange={(e) =>
                      setEditingDimension({ ...editingDimension, description: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分数区间（可选）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editingDimension.minScore ?? ''}
                      onChange={(e) =>
                        setEditingDimension({
                          ...editingDimension,
                          minScore: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="最低分"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      value={editingDimension.maxScore ?? ''}
                      onChange={(e) =>
                        setEditingDimension({
                          ...editingDimension,
                          maxScore: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="最高分"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    如不设置，系统将自动计算理论分数区间
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => {
                    setShowDimensionModal(false)
                    setEditingDimension(null)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateDimension}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">
                {editingItem.id ? '编辑题目' : '添加题目'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    题目内容 *
                  </label>
                  <textarea
                    value={editingItem.content}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, content: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                    placeholder="请输入题目内容"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      题目编码
                    </label>
                    <input
                      type="text"
                      value={editingItem.itemCode}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, itemCode: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingItem.reverse}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, reverse: e.target.checked })
                        }
                        className="mr-2"
                      />
                      反向计分
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    关联维度
                  </label>
                  <div className="space-y-2">
                    {dimensions.map((dim) => {
                      const isLinked = editingItem.itemDimensions.some(
                        (d) => d.dimensionId === dim.id
                      )
                      return (
                        <label key={dim.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingItem({
                                  ...editingItem,
                                  itemDimensions: [
                                    ...editingItem.itemDimensions,
                                    {
                                      dimensionId: dim.id,
                                      weight: 1,
                                      reverse: false,
                                      dimension: {
                                        id: dim.id,
                                        code: dim.code,
                                        name: dim.name,
                                      },
                                    },
                                  ],
                                })
                              } else {
                                setEditingItem({
                                  ...editingItem,
                                  itemDimensions: editingItem.itemDimensions.filter(
                                    (d) => d.dimensionId !== dim.id
                                  ),
                                })
                              }
                            }}
                            className="mr-2"
                          />
                          {dim.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveItem}
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScaleEdit
