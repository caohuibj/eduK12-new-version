import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Eye, Plus, Save, Trash2 } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../components/product-ui'

type ResponseValue = string | number
type Direction = 'higher_is_better' | 'higher_is_worse' | 'higher_is_more' | 'lower_is_better' | 'bipolar' | 'descriptive'
type Aggregation = 'sum' | 'mean'

interface ResponseOption {
  value: ResponseValue
  label: string
  score: number
}

interface ScaleDefinition {
  schemaVersion: 2
  respondentType: string
  source: { title?: string; citation?: string; url?: string; publicationYear?: number }
  license: { status: 'self_authored' | 'authorized' | 'verified' | 'unknown'; redistribution: 'allowed' | 'restricted' | 'unknown'; note?: string }
  display: { randomizeItems: boolean }
  responseSets: Array<{ key: string; options: ResponseOption[] }>
  items: Array<{ itemCode: string; content: string; type: string; required: boolean; sortOrder: number; responseSetKey: string; randomizeOptions: boolean }>
  scoring: {
    scoringVersion: string
    itemRules: Array<{ itemCode: string; transform: { type: 'identity' | 'reverse' } }>
    defaultMissingPolicy: { type: 'complete_required' }
    scores: Array<{
      key: string
      type: 'total' | 'dimension'
      label: string
      description?: string
      direction: Direction
      canonical: boolean
      displayPrecision: number
      source: { type: 'items'; items: Array<{ itemCode: string; weight: number }>; aggregation: Aggregation }
    }>
  }
  report: {
    reportVersion: string
    primaryScoreKeys: string[]
    scoreOrder: string[]
    interpretations: Array<{ scoreKey: string; headline: string; source: { type: 'score_only' }; summary: string; bands: []; guidance: [] }>
    limitations: string[]
    disclaimer: string
  }
  referencePolicy: { type: 'none' }
}

interface ScaleMeta {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  visibility: 'HIDDEN' | 'COURSE' | 'PUBLIC'
  instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  instrumentVersion: string
  estimatedTime: number | null
  instruction: string | null
  tags?: string[]
}

const emptyDefinition = (): ScaleDefinition => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: '教师自建内容' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{ key: 'default', options: [
    { value: 'option_1', label: '选项 1', score: 1 },
    { value: 'option_2', label: '选项 2', score: 2 },
    { value: 'option_3', label: '选项 3', score: 3 },
    { value: 'option_4', label: '选项 4', score: 4 },
    { value: 'option_5', label: '选项 5', score: 5 },
  ] }],
  items: [],
  scoring: { scoringVersion: '2.0.0', itemRules: [], defaultMissingPolicy: { type: 'complete_required' }, scores: [] },
  report: { reportVersion: 'scale-report-v2', primaryScoreKeys: [], scoreOrder: [], interpretations: [], limitations: ['这是自定义描述性量表结果，不提供人口常模或诊断结论。'], disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。' },
  referencePolicy: { type: 'none' },
})

const emptyScale = (): ScaleMeta => ({
  id: '', code: '', name: '', description: '', status: 'DRAFT', visibility: 'HIDDEN', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0', estimatedTime: 15, instruction: '', tags: [],
})

const normalizeDefinition = (raw: any): ScaleDefinition => {
  const base = emptyDefinition()
  if (!raw || raw.schemaVersion !== 2) return base
  return {
    ...base,
    ...raw,
    source: { ...base.source, ...(raw.source || {}) },
    license: { ...base.license, ...(raw.license || {}) },
    display: { ...base.display, ...(raw.display || {}) },
    responseSets: Array.isArray(raw.responseSets) && raw.responseSets.length > 0 ? raw.responseSets : base.responseSets,
    items: raw.items || [],
    scoring: {
      ...base.scoring,
      ...(raw.scoring || {}),
      itemRules: raw.scoring?.itemRules || [],
      scores: raw.scoring?.scores || [],
      defaultMissingPolicy: { type: 'complete_required' },
    },
    report: { ...base.report, ...(raw.report || {}) },
    referencePolicy: { type: 'none' },
  }
}

const scoreSourceFor = (definition: ScaleDefinition, scoreKey: string) => {
  const score = definition.scoring.scores.find((candidate) => candidate.key === scoreKey)
  return score?.source.type === 'items' ? score.source.items : []
}

const updateReportContract = (definition: ScaleDefinition): ScaleDefinition => {
  const keys = definition.scoring.scores.map((score) => score.key)
  const interpretations = definition.scoring.scores.map((score) => {
    const existing = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key)
    return existing || { scoreKey: score.key, headline: score.label, source: { type: 'score_only' as const }, summary: `${score.label}为描述性结果，请结合题目内容和实际情境理解。`, bands: [] as [], guidance: [] as [] }
  })
  return {
    ...definition,
    report: {
      ...definition.report,
      primaryScoreKeys: definition.scoring.scores.filter((score) => score.canonical).map((score) => score.key),
      scoreOrder: keys,
      interpretations,
    } as ScaleDefinition['report'],
  }
}

const ScaleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [scale, setScale] = useState<ScaleMeta>(emptyScale)
  const [definition, setDefinition] = useState<ScaleDefinition>(emptyDefinition)
  const [activeTab, setActiveTab] = useState<'basic' | 'responses' | 'items' | 'scores' | 'report'>('basic')
  const [issues, setIssues] = useState<Array<{ path: string; message: string; severity?: string }>>([])
  const [preview, setPreview] = useState<any>(null)

  const standard = scale.instrumentClass === 'STANDARD'
  const responseSet = definition.responseSets[0]
  const sortedItems = useMemo(() => [...definition.items].sort((a, b) => a.sortOrder - b.sortOrder), [definition.items])

  useEffect(() => {
    if (isNew || !id) return
    const load = async () => {
      try {
        const response = await apiClient.get<any>(`/scales/${id}`)
        if (response.code !== 0 || !response.data) throw new Error(response.message || '量表加载失败')
        const value = response.data
        setScale({
          id: value.id, code: value.code, name: value.name, description: value.description, status: value.status, visibility: value.visibility,
          instrumentClass: value.instrumentClass || 'CUSTOM_DESCRIPTIVE', instrumentVersion: value.instrumentVersion || '2.0.0', estimatedTime: value.estimatedTime, instruction: value.instruction, tags: value.tags || [],
        })
        setDefinition(normalizeDefinition(value.definition))
      } catch (error) {
        setIssues([{ path: 'load', message: (error as { message?: string }).message || '量表加载失败', severity: 'error' }])
      } finally { setLoading(false) }
    }
    void load()
  }, [id, isNew])

  const saveBasic = async () => {
    if (!scale.code || !scale.name) { setIssues([{ path: 'basic', message: '量表编码和名称不能为空', severity: 'error' }]); return }
    try {
      setSaving(true)
      if (isNew) {
        const response = await apiClient.post<any>('/scales', { code: scale.code, name: scale.name, description: scale.description || undefined, visibility: scale.visibility, estimatedTime: scale.estimatedTime || undefined, instruction: scale.instruction || undefined, tags: scale.tags || [] })
        if (response.code !== 0 || !response.data) throw new Error(response.message || '创建失败')
        navigate(`/scales/${response.data.id}`)
        return
      }
      const response = await apiClient.put<any>(`/scales/${scale.id}`, { name: scale.name, description: scale.description || undefined, visibility: scale.visibility, estimatedTime: scale.estimatedTime || undefined, instruction: scale.instruction || undefined, tags: scale.tags || [] })
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      setScale((current) => ({ ...current, ...response.data }))
      setIssues([])
    } catch (error) { setIssues([{ path: 'basic', message: (error as { message?: string }).message || '保存失败', severity: 'error' }]) } finally { setSaving(false) }
  }

  const saveDefinition = async (): Promise<boolean> => {
    if (!scale.id || standard || saving) return false
    try {
      setSaving(true)
      const next = updateReportContract(definition)
      const response = await apiClient.put<any>(`/scales/${scale.id}/definition`, { definition: next })
      if (response.code !== 0) throw new Error(response.message || 'definition 保存失败')
      const confirmed = await apiClient.get<any>(`/scales/${scale.id}`)
      if (confirmed.code !== 0 || !confirmed.data?.definition) throw new Error('未能确认保存结果，请重试；当前编辑内容已保留')
      const stored = normalizeDefinition(confirmed.data.definition)
      const selectedItems = (value: ScaleDefinition) => value.scoring.scores.map(score => ({
        key: score.key, aggregation: score.source.aggregation,
        items: score.source.items.map(item => ({ itemCode: item.itemCode, weight: item.weight })),
      }))
      if (JSON.stringify(selectedItems(stored)) !== JSON.stringify(selectedItems(next))) throw new Error('保存后的计分题目与当前选择不一致，请重试；当前编辑内容已保留')
      setDefinition(stored)
      setIssues([{ path: '计分与题目', message: '已保存，并重新读取确认计分题目。', severity: 'success' }])
      return true
    } catch (error) { setIssues([{ path: 'definition', message: (error as { message?: string }).message || 'definition 保存失败', severity: 'error' }]); return false } finally { setSaving(false) }
  }

  const validate = async () => {
    if (!scale.id) return
    try {
      const response = await apiClient.post<any>(`/scales/${scale.id}/validate`, {})
      if (response.code !== 0) throw new Error(response.message || '校验失败')
      setIssues(response.data.issues || [])
      if (response.data.valid) setIssues([{ path: 'definition', message: '发布检查通过，可以发布描述性量表。', severity: 'success' }])
    } catch (error) { setIssues([{ path: 'validate', message: (error as { message?: string }).message || '校验失败', severity: 'error' }]) }
  }

  const previewDefinition = async () => {
    if (!scale.id || sortedItems.length === 0) return
    try {
      const response = await apiClient.post<any>(`/scales/${scale.id}/preview`, { answers: sortedItems.map((item) => ({ itemCode: item.itemCode, responseValue: responseSet.options[0]?.value })) })
      if (response.code !== 0) throw new Error(response.message || '预览失败')
      setPreview(response.data)
    } catch (error) { setIssues([{ path: 'preview', message: (error as { message?: string }).message || '预览失败', severity: 'error' }]) }
  }

  const publish = async () => {
    if (!scale.id || standard) return
    const saved = await saveDefinition()
    if (!saved) return
    try {
      const response = await apiClient.post<any>(`/scales/${scale.id}/publish`, {})
      if (response.code !== 0) throw new Error(response.message || '发布失败')
      setScale((current) => ({ ...current, status: 'PUBLISHED' }))
      setIssues([{ path: 'publish', message: '量表已发布。', severity: 'success' }])
    } catch (error) { setIssues([{ path: 'publish', message: (error as { message?: string }).message || '发布失败', severity: 'error' }]) }
  }

  const updateOption = (index: number, patch: Partial<ResponseOption>) => setDefinition((current) => ({ ...current, responseSets: [{ ...current.responseSets[0], options: current.responseSets[0].options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }] }))
  const addOption = () => setDefinition((current) => ({ ...current, responseSets: [{ ...current.responseSets[0], options: [...current.responseSets[0].options, { value: `option_${current.responseSets[0].options.length + 1}`, label: `选项 ${current.responseSets[0].options.length + 1}`, score: current.responseSets[0].options.length + 1 }] }] }))
  const removeOption = (index: number) => setDefinition((current) => current.responseSets[0].options.length <= 2 ? current : ({ ...current, responseSets: [{ ...current.responseSets[0], options: current.responseSets[0].options.filter((_, optionIndex) => optionIndex !== index) }] }))

  const addItem = () => setDefinition((current) => {
    const itemCodes = new Set(current.items.map((item) => item.itemCode))
    let number = current.items.length + 1
    while (itemCodes.has(`Q${number}`)) number += 1
    const itemCode = `Q${number}`
    return {
      ...current,
      items: [...current.items, { itemCode, content: '', type: 'single', required: true, sortOrder: current.items.length + 1, responseSetKey: 'default', randomizeOptions: false }],
      scoring: { ...current.scoring, itemRules: [...current.scoring.itemRules, { itemCode, transform: { type: 'identity' } }] },
    }
  })
  const updateItem = (itemCode: string, patch: Partial<ScaleDefinition['items'][number]>) => setDefinition((current) => ({ ...current, items: current.items.map((item) => item.itemCode === itemCode ? { ...item, ...patch } : item) }))
  const toggleReverse = (itemCode: string) => setDefinition((current) => ({ ...current, scoring: { ...current.scoring, itemRules: current.scoring.itemRules.map((rule) => rule.itemCode === itemCode ? { ...rule, transform: { type: rule.transform.type === 'reverse' ? 'identity' : 'reverse' } } : rule) } }))
  const removeItem = (itemCode: string) => setDefinition((current) => ({ ...current, items: current.items.filter((item) => item.itemCode !== itemCode).map((item, index) => ({ ...item, sortOrder: index + 1 })), scoring: { ...current.scoring, itemRules: current.scoring.itemRules.filter((rule) => rule.itemCode !== itemCode), scores: current.scoring.scores.map((score) => ({ ...score, source: { ...score.source, items: score.source.items.filter((item) => item.itemCode !== itemCode) } })) } }))

  const addScore = (type: 'total' | 'dimension') => setDefinition((current) => {
    const scoreKeys = new Set(current.scoring.scores.map((score) => score.key))
    let index = current.scoring.scores.length + 1
    while (scoreKeys.has(`${type}_${index}`)) index += 1
    const key = `${type}_${index}`
    const score = { key, type, label: type === 'total' ? '总分' : `维度 ${index}`, direction: 'descriptive' as Direction, canonical: current.scoring.scores.length === 0, displayPrecision: 1, source: { type: 'items' as const, items: [] as Array<{ itemCode: string; weight: number }>, aggregation: 'sum' as Aggregation } }
    return updateReportContract({ ...current, scoring: { ...current.scoring, scores: [...current.scoring.scores, score] } })
  })
  const updateScore = (key: string, patch: Partial<ScaleDefinition['scoring']['scores'][number]>) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => score.key === key ? { ...score, ...patch } : score) } }))
  const toggleScoreItem = (scoreKey: string, itemCode: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => { if (score.key !== scoreKey) return score; const exists = score.source.items.some((item) => item.itemCode === itemCode); const items = exists ? score.source.items.filter((item) => item.itemCode !== itemCode) : [...score.source.items, { itemCode, weight: 1 }]; return { ...score, source: { ...score.source, items } } }) } }))
  const removeScore = (key: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.filter((score) => score.key !== key) } }))
  const updateInterpretation = (scoreKey: string, patch: { headline?: string; summary?: string }) => setDefinition((current) => ({ ...current, report: { ...current.report, interpretations: current.report.interpretations.map((entry) => entry.scoreKey === scoreKey ? { ...entry, ...patch } : entry) } }))

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载量表编辑器">正在读取量表定义与报告配置。</ProductStatus></ProductPage>

  const tabs: Array<[typeof activeTab, string]> = [['basic', '基本信息'], ['responses', '响应选项'], ['items', '题目'], ['scores', '计分'], ['report', '报告文案']]
  return (
    <ProductPage width="management" className="staff-editor-page">
      <PageHeader
        title={isNew ? '创建描述性量表' : scale.name || '量表编辑'}
        description={standard ? 'STANDARD package · 只读' : '自定义量表 · 描述性结果 · 不提供群体参考'}
        actions={(
          <div className="staff-inline-actions">
            <Link to="/scales" className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />返回量表列表</Link>
            {!isNew && <button onClick={() => void previewDefinition()} disabled={saving || standard} className="hui-button hui-button--secondary"><Eye className="w-4 h-4" aria-hidden="true" />计分预览</button>}
            {!standard && <button onClick={() => void (isNew ? saveBasic() : saveDefinition())} disabled={saving} className="hui-button hui-button--secondary"><Save className="w-4 h-4" aria-hidden="true" />保存草稿</button>}
          </div>
        )}
      />
      {issues.length > 0 && <div className="mb-5 rounded-lg border p-4 bg-gray-50"><ul className="space-y-1 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`} className={issue.severity === 'success' ? 'text-green-700' : 'text-red-700'}>{issue.severity === 'success' && <CheckCircle className="w-4 h-4 inline mr-1" />}{issue.path}：{issue.message}</li>)}</ul></div>}
      <div className="staff-toolbar"><div className="staff-segmented" role="group" aria-label="量表编辑分区">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>{label}</button>)}</div></div>

      {activeTab === 'basic' && <section className="staff-panel staff-panel--padded p-6 space-y-4"><div className="grid md:grid-cols-2 gap-4"><label className="text-sm text-gray-700">量表编码<input disabled={!isNew || standard} value={scale.code} onChange={(event) => setScale({ ...scale, code: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">量表名称<input disabled={standard || saving} value={scale.name} onChange={(event) => setScale({ ...scale, name: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">预计用时（分钟）<input type="number" disabled={standard || saving} value={scale.estimatedTime ?? ''} onChange={(event) => setScale({ ...scale, estimatedTime: event.target.value ? Number(event.target.value) : null })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">可见性<select disabled={standard || saving} value={scale.visibility} onChange={(event) => setScale({ ...scale, visibility: event.target.value as ScaleMeta['visibility'] })} className="input mt-1 w-full"><option value="HIDDEN">隐藏</option><option value="COURSE">课程可用</option><option value="PUBLIC">公开可用</option></select></label></div><label className="block text-sm text-gray-700">说明<textarea disabled={standard || saving} value={scale.description || ''} onChange={(event) => setScale({ ...scale, description: event.target.value })} className="input mt-1 w-full min-h-24" /></label><label className="block text-sm text-gray-700">作答指导<textarea disabled={standard || saving} value={scale.instruction || ''} onChange={(event) => setScale({ ...scale, instruction: event.target.value })} className="input mt-1 w-full min-h-24" /></label><label className="block text-sm text-gray-700">自有内容 / 授权声明<textarea disabled={standard || saving} value={definition.license.note || ''} onChange={(event) => setDefinition((current) => ({ ...current, license: { ...current.license, note: event.target.value } }))} className="input mt-1 w-full min-h-20" placeholder="说明题目内容由谁提供，以及允许在本系统中使用的范围" /></label><div className="flex justify-end"><button onClick={() => void saveBasic()} disabled={saving || standard} className="hui-button hui-button--primary"><Save className="w-4 h-4 inline mr-1" />保存基本信息</button></div></section>}

      {activeTab === 'responses' && <section className="staff-panel staff-panel--padded p-6"><div className="flex justify-between mb-4"><div><h2 className="font-semibold">共享响应选项</h2><p className="text-sm text-gray-500">学生只看到标签；分值仅由服务端用于权威计分。</p></div><button onClick={addOption} disabled={standard || saving} className="hui-button hui-button--secondary"><Plus className="w-4 h-4 inline mr-1" />增加选项</button></div><div className="space-y-3">{responseSet.options.map((option, index) => <div key={index} className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 items-center"><input disabled={standard || saving} value={String(option.value)} onChange={(event) => updateOption(index, { value: event.target.value })} className="input" placeholder="稳定 value" /><input disabled={standard || saving} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} className="input" placeholder="显示标签" /><input disabled={standard || saving} type="number" value={option.score} onChange={(event) => updateOption(index, { score: Number(event.target.value) })} className="input" placeholder="基础分" /><button onClick={() => removeOption(index)} disabled={standard || responseSet.options.length <= 2} className="text-red-500 disabled:text-gray-300"><Trash2 className="w-4 h-4" /></button></div>)}</div><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={saving || standard} className="hui-button hui-button--primary">保存响应集</button></div></section>}

      {activeTab === 'items' && <section className="staff-panel staff-panel--padded p-6"><div className="flex justify-between mb-4"><div><h2 className="font-semibold">题目</h2><p className="text-sm text-gray-500">每题使用稳定 itemCode；本编辑器强制完整作答。</p></div><button onClick={addItem} disabled={standard || saving} className="hui-button hui-button--secondary"><Plus className="w-4 h-4 inline mr-1" />增加题目</button></div><div className="space-y-3">{sortedItems.map((item) => { const rule = definition.scoring.itemRules.find((candidate) => candidate.itemCode === item.itemCode); return <div key={item.itemCode} className="border rounded-lg p-3 grid md:grid-cols-[100px_1fr_auto] gap-3 items-start"><input disabled value={item.itemCode} className="input bg-gray-50" title="itemCode 是稳定标识，不能在编辑器中修改" /><textarea disabled={standard || saving} value={item.content} onChange={(event) => updateItem(item.itemCode, { content: event.target.value })} className="input min-h-20" placeholder="题目内容" /><div className="flex md:flex-col gap-2 text-sm"><label><input type="checkbox" checked={rule?.transform.type === 'reverse'} disabled={standard || saving} onChange={() => toggleReverse(item.itemCode)} /> 反向计分</label><label><input type="checkbox" checked={item.required} disabled /> 必答</label><button onClick={() => removeItem(item.itemCode)} disabled={standard || saving} className="text-red-500 text-left"><Trash2 className="w-4 h-4 inline mr-1" />删除</button></div></div> })}</div><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={saving || standard} className="hui-button hui-button--primary">保存题目</button></div></section>}

      {activeTab === 'scores' && <section className="staff-panel staff-panel--padded p-6"><div className="flex justify-between mb-4"><div><h2 className="font-semibold">计分定义</h2><p className="text-sm text-gray-500">选择参与计分的题目，设置总分或维度分、求和或平均以及分数方向。新增计分项默认不选题；选中题目会高亮显示。</p></div><div className="flex gap-2"><button onClick={() => addScore('total')} disabled={standard || saving || sortedItems.length === 0} className="hui-button hui-button--secondary">+ 总分</button><button onClick={() => addScore('dimension')} disabled={standard || saving || sortedItems.length === 0} className="hui-button hui-button--secondary">+ 维度</button></div></div><div className="space-y-5">{definition.scoring.scores.map((score) => <article key={score.key} className="border rounded-lg p-4"><div className="grid md:grid-cols-[1fr_1fr_180px_auto] gap-2 items-center"><input disabled={standard || saving} value={score.key} onChange={(event) => updateScore(score.key, { key: event.target.value })} className="input" placeholder="稳定 score key" /><input disabled={standard || saving} value={score.label} onChange={(event) => updateScore(score.key, { label: event.target.value })} className="input" placeholder="显示名称" /><select disabled={standard || saving} value={score.direction} onChange={(event) => updateScore(score.key, { direction: event.target.value as Direction })} className="input"><option value="descriptive">描述性</option><option value="higher_is_more">高分代表更多</option><option value="higher_is_worse">高分代表更多困难</option><option value="higher_is_better">高分更有利</option><option value="lower_is_better">低分更有利</option><option value="bipolar">双向</option></select><button onClick={() => removeScore(score.key)} disabled={standard || saving} className="text-red-500"><Trash2 className="w-4 h-4" /></button></div><div className="flex flex-wrap gap-4 mt-3 text-sm"><label><input type="checkbox" checked={score.canonical} disabled={standard || saving} onChange={(event) => updateScore(score.key, { canonical: event.target.checked })} /> canonical</label><label>聚合<select disabled={standard || saving} value={score.source.aggregation} onChange={(event) => updateScore(score.key, { source: { ...score.source, aggregation: event.target.value as Aggregation } })} className="input ml-1 py-1"><option value="sum">sum</option><option value="mean">mean</option></select></label></div><div className="mt-3 flex flex-wrap gap-2">{sortedItems.map((item) => <button type="button" key={item.itemCode} aria-pressed={scoreSourceFor(definition, score.key).some(candidate => candidate.itemCode === item.itemCode)} disabled={standard || saving} onClick={() => toggleScoreItem(score.key, item.itemCode)} className={`px-2 py-1 rounded border text-xs ${scoreSourceFor(definition, score.key).some((candidate) => candidate.itemCode === item.itemCode) ? 'border-action bg-action/5 text-action' : 'border-gray-300 text-gray-500'}`}>{item.itemCode}</button>)}</div></article>)}</div><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={saving || standard} className="hui-button hui-button--primary">保存计分定义</button></div></section>}

      {activeTab === 'report' && <section className="staff-panel staff-panel--padded p-6"><h2 className="font-semibold mb-2">量表专属解释</h2><p className="text-sm text-gray-500 mb-5">自定义量表仅能写描述性解释；页面不会提供 cutoff、正常/异常、常模或百分位配置。</p><div className="space-y-4">{definition.scoring.scores.map((score) => { const entry = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key); if (!entry) return null; return <article key={score.key} className="border rounded-lg p-4 space-y-2"><h3 className="font-medium">{score.label}</h3><input disabled={standard || saving} value={entry.headline} onChange={(event) => updateInterpretation(score.key, { headline: event.target.value })} className="input w-full" placeholder="标题" /><textarea disabled={standard || saving} value={entry.summary} onChange={(event) => updateInterpretation(score.key, { summary: event.target.value })} className="input w-full min-h-20" placeholder="描述性解释" /></article> })}</div><label className="block text-sm text-gray-700 mt-5">免责声明<textarea disabled={standard || saving} value={definition.report.disclaimer} onChange={(event) => setDefinition((current) => ({ ...current, report: { ...current.report, disclaimer: event.target.value } }))} className="input mt-1 w-full min-h-20" /></label><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={saving || standard} className="hui-button hui-button--primary">保存报告定义</button></div></section>}

      {preview && <section className="staff-panel staff-panel--padded p-6 mt-5"><h2 className="font-semibold mb-3">计分预览</h2><pre className="text-xs bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify(preview, null, 2)}</pre></section>}
      {!isNew && !standard && <div className="flex justify-end gap-2 mt-6"><button onClick={() => void validate()} disabled={saving} className="hui-button hui-button--secondary">运行发布检查</button><button onClick={() => void publish()} disabled={saving || scale.status !== 'DRAFT'} className="hui-button hui-button--primary">发布描述性量表</button></div>}
    </ProductPage>
  )
}

export default ScaleEdit
