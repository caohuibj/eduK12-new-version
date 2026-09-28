import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Plus, Send, Trash2 } from 'lucide-react'
import apiClient from '../../api/client'
import { sessionFetch } from '../../api/client'
import { compositeApi } from '../../modules/composite/api'
import type {
  AnalysisProtocolCatalogItem,
  AnalysisProtocolProfile,
  CompositeAnalysisProtocol,
  ReportPackageCatalogItem,
  ReportPackageProfile,
} from '../../modules/composite/types'
import { contextOptionsForKey, contextValueHint, parseDelimitedOptions, serializeDelimitedOptions } from '../../modules/assessment-context/options'
import { PageHeader, ProductPage } from '../../components/product-ui'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import FormSectionManager from '../../components/FormSectionManager'

const errorMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

const CompositeAssessmentEdit: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // PR6B replaces the teacher-facing protocol picker with the package catalog.
  // The legacy branch remains only for older integration doubles/historical
  // records that predate the package endpoint.
  const packageCatalogAvailable = typeof compositeApi.listReportPackages === 'function'
  const [detail, setDetail] = useState<any>(null)
  const [scales, setScales] = useState<any[]>([])
  const [cognitiveAssignments, setCognitiveAssignments] = useState<any[]>([])
  const [protocols, setProtocols] = useState<AnalysisProtocolCatalogItem[]>([])
  const [reportPackages, setReportPackages] = useState<ReportPackageCatalogItem[]>([])
  const [protocolChoice, setProtocolChoice] = useState('')
  const [protocolProfile, setProtocolProfile] = useState<AnalysisProtocolProfile>('standard')
  const [packageChoice, setPackageChoice] = useState('')
  const [packageProfile, setPackageProfile] = useState<ReportPackageProfile>('standard')
  const [savingProtocol, setSavingProtocol] = useState(false)
  const [type, setType] = useState<'SCALE' | 'COGNITIVE' | 'FORM' | 'SITUATIONAL'>('SCALE')
  const [selectedId, setSelectedId] = useState('')
  const [situationalInstruments, setSituationalInstruments] = useState<any[]>([])
  const [formLabel, setFormLabel] = useState('')
  const [formType, setFormType] = useState('text_input')
  const [formOptions, setFormOptions] = useState('')
  const [formContextKey, setFormContextKey] = useState('')
  const [formRequired, setFormRequired] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCopyable, setSavingCopyable] = useState(false)
  const cognitiveModuleEnabled = useCognitiveEnabled()

  const load = async () => {
    try {
      const [detailResponse, scaleResponse, protocolResponse, packageResponse, situationalResponse] = await Promise.all([
        compositeApi.detail(id),
        apiClient.get<any>('/scales?status=PUBLISHED&page=1&pageSize=100'),
        packageCatalogAvailable
          ? Promise.resolve({ code: 0, data: { list: [] as AnalysisProtocolCatalogItem[] }, message: '' })
          : compositeApi.listAnalysisProtocols(),
        packageCatalogAvailable
          ? compositeApi.listReportPackages!()
          : Promise.resolve({ code: 0, data: { list: [] } }),
        apiClient.get<any>('/situational/instruments'),
      ])
      if (detailResponse.code !== 0 || !detailResponse.data) throw new Error(detailResponse.message || '综合测评不存在')
      setDetail(detailResponse.data)
      const currentProtocol = detailResponse.data.analysisProtocol as CompositeAnalysisProtocol | null | undefined
      setProtocolChoice(currentProtocol ? `${currentProtocol.key}/${currentProtocol.version}` : '')
      setProtocolProfile(currentProtocol?.profile === 'research' ? 'research' : 'standard')
      const currentPackage = detailResponse.data.reportPackage as { key: string; version: string; profile?: ReportPackageProfile | null } | null | undefined
      setPackageChoice(currentPackage ? `${currentPackage.key}/${currentPackage.version}` : '')
      setPackageProfile(currentPackage?.profile === 'research' ? 'research' : 'standard')
      if (protocolResponse.code === 0 && protocolResponse.data) setProtocols(protocolResponse.data.list)
      else setError(protocolResponse.message || '无法加载综合分析协议')
      if (packageResponse.code === 0 && packageResponse.data) setReportPackages(packageResponse.data.list)
      const scaleData = Array.isArray(scaleResponse.data) ? scaleResponse.data : scaleResponse.data?.list || scaleResponse.data?.data?.list || []
      setScales(scaleData)
      const situationalData = Array.isArray(situationalResponse.data) ? situationalResponse.data : situationalResponse.data?.list || []
      setSituationalInstruments(situationalData)
      try {
        const cognitiveResponse = await apiClient.get<any>('/cognitive/assignments?status=PUBLISHED&listedStandalone=true')
        const cognitiveData = Array.isArray(cognitiveResponse.data)
          ? cognitiveResponse.data
          : cognitiveResponse.data?.list || []
        if (cognitiveResponse.code !== 0) throw new Error(cognitiveResponse.message || '无法加载认知任务')
        setCognitiveAssignments(cognitiveData.filter((item: any) => item.listedStandalone !== false))
      } catch (err) {
        setCognitiveAssignments([])
        setError(errorMessage(err, '无法加载已发布的认知任务'))
      }
    } catch (err) {
      setError(errorMessage(err, '加载配置失败'))
    }
  }

  useEffect(() => { void load() }, [id])

  const saveAnalysisProtocol = async () => {
    const selected = protocols.find((protocol) => `${protocol.key}/${protocol.version}` === protocolChoice)
    const current = detail?.analysisProtocol as CompositeAnalysisProtocol | null | undefined
    if (protocolChoice && !selected) {
      setError('当前协议版本已停止新建，可保留现状或切换为“仅收集”')
      return
    }
    if (!protocolChoice && current && !confirm('切换为“仅收集”后，现有任务会保留，但不再生成综合分析报告。确定继续吗？')) return
    try {
      setSavingProtocol(true)
      setError(null)
      const response = await compositeApi.setAnalysisProtocol(
        id,
        selected ? { key: selected.key, version: selected.version, profile: protocolProfile } : null,
      )
      if (response.code !== 0) throw new Error(response.message || '更新报告模式失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '更新报告模式失败'))
    } finally {
      setSavingProtocol(false)
    }
  }

  const saveReportPackage = async () => {
    const selected = reportPackages.find((pkg) => `${pkg.key}/${pkg.version}` === packageChoice)
    const current = detail?.reportPackage as { key: string; version: string; profile?: ReportPackageProfile | null } | null | undefined
    if (packageChoice && !selected) {
      setError('当前报告包版本已停止新建，请保留现状或切换为仅收集')
      return
    }
    if (!packageChoice && current && !confirm('报告包实例不能切回自由组合；如需收集模式，请复制为新的草稿。')) return
    try {
      setSavingProtocol(true)
      setError(null)
      const response = await compositeApi.setReportPackage(
        id,
        selected ? { key: selected.key, version: selected.version, profile: packageProfile } : null,
      )
      if (response.code !== 0) throw new Error(response.message || '更新报告包失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '更新报告包失败'))
    } finally {
      setSavingProtocol(false)
    }
  }

  const addItem = async () => {
    try {
      const input: Record<string, unknown> = { type, required: type === 'FORM' ? formRequired : true }
      if (type === 'SCALE') input.scaleId = selectedId
      if (type === 'COGNITIVE') input.cognitiveAssignmentId = selectedId
      if (type === 'SITUATIONAL') {
        const separator = selectedId.lastIndexOf('/')
        input.situationalInstrumentKey = separator > 0 ? selectedId.slice(0, separator) : selectedId
        input.situationalInstrumentVersion = separator > 0 ? selectedId.slice(separator + 1) : undefined
      }
      if (type === 'FORM') {
        input.formLabel = formLabel
        input.formType = formType
        input.formOptions = formOptions ? parseDelimitedOptions(formOptions) : null
        input.contextKey = formContextKey || null
      }
      const response = await compositeApi.addItem(id, input)
      if (response.code !== 0) throw new Error(response.message || '添加模块失败')
      setSelectedId('')
      setFormLabel('')
      setFormOptions('')
      setFormContextKey('')
      setFormRequired(true)
      await load()
    } catch (err) {
      setError(errorMessage(err, '添加模块失败'))
    }
  }

  const removeItem = async (itemId: string) => {
    if (!confirm('确定移除这个模块吗？')) return
    try {
      const response = await compositeApi.removeItem(id, itemId)
      if (response.code !== 0) throw new Error(response.message || '移除模块失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '移除模块失败'))
    }
  }

  const moveItem = async (index: number, direction: -1 | 1) => {
    if (!detail?.items) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= detail.items.length) return
    const reordered = detail.items.map((item: any, itemIndex: number) => {
      if (itemIndex === index) return { id: item.id, position: detail.items[targetIndex].position }
      if (itemIndex === targetIndex) return { id: item.id, position: detail.items[index].position }
      return { id: item.id, position: item.position }
    })
    try {
      const response = await compositeApi.reorderItems(id, reordered)
      if (response.code !== 0) throw new Error(response.message || '调整顺序失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '调整顺序失败'))
    }
  }

  const publish = async () => {
    try {
      const response = await compositeApi.publish(id)
      if (response.code !== 0) setError(response.message || '发布失败')
      else await load()
    } catch (err) {
      setError(errorMessage(err, '发布失败'))
    }
  }

  const toggleCopyable = async (copyable: boolean) => {
    try {
      setSavingCopyable(true)
      setError(null)
      const response = await compositeApi.update(id, { copyable })
      if (response.code !== 0) throw new Error(response.message || '更新复制开关失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '更新复制开关失败'))
    } finally {
      setSavingCopyable(false)
    }
  }

  const exportData = async (detailMode: 'summary' | 'full') => {
    try {
      const response = await compositeApi.exportData(id, { detail: detailMode, format: 'csv' })
      if (response.code !== 0 || !response.data?.fileName) {
        setError(response.message || '导出失败')
        return
      }
      const download = await sessionFetch(`/api/composite-assessments/${id}/export/files/${response.data.fileName}`)
      if (!download.ok) throw new Error('下载导出文件失败')
      const blobUrl = URL.createObjectURL(await download.blob())
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = response.data.fileName
      anchor.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setError(errorMessage(err, '下载导出文件失败'))
    }
  }

  if (!detail) return <div className="p-8 text-gray-500">{error || '加载中...'}</div>

  const isDraft = detail.status === 'DRAFT'
  const isLibraryCourse = Boolean(detail.course?.isLibrary)
  const reportPackage = detail.reportPackage as { key: string; version: string; profile?: ReportPackageProfile | null; frozen?: boolean } | null | undefined
  const analysisProtocol = reportPackage ? null : detail.analysisProtocol as CompositeAnalysisProtocol | null | undefined
  const protocolLocked = Boolean(analysisProtocol || reportPackage)
  const packageLocked = Boolean(reportPackage)
  const selectedPackage = reportPackages.find((pkg) => `${pkg.key}/${pkg.version}` === packageChoice)
  const selectedProtocol = protocols.find((protocol) => `${protocol.key}/${protocol.version}` === protocolChoice)
  const currentProtocolId = analysisProtocol ? `${analysisProtocol.key}/${analysisProtocol.version}` : ''
  const protocolSelectionChanged = protocolChoice !== currentProtocolId
    || (Boolean(analysisProtocol) && protocolProfile !== analysisProtocol?.profile)
  const itemLabel = (item: any) =>
    item.type === 'SCALE' ? item.scale?.name : item.type === 'COGNITIVE' ? item.cognitiveAssignment?.title : item.type === 'SITUATIONAL' ? item.situational?.key : item.form?.label

  return (
    <ProductPage width="management" className="staff-editor-page">
      <PageHeader
        title={detail.name}
        description={(
          <span className="flex flex-wrap items-center gap-2">
            <span>{detail.code} · {detail.status} · 已开始 {detail.attemptCounts?.started ?? 0} · 已完成 {detail.attemptCounts?.completed ?? 0}</span>
            {isLibraryCourse && <span className="staff-badge">库课程</span>}
            {detail.copyable && <span className="staff-badge staff-badge--success">可复制</span>}
          </span>
        )}
        actions={(
          <div className="staff-inline-actions">
            <button type="button" onClick={() => navigate('/composite-assessments')} className="hui-button hui-button--secondary"><ArrowLeft className="w-4 h-4" aria-hidden="true" />返回综合测评</button>
            {isDraft && <button onClick={() => void publish()} className="hui-button hui-button--primary"><Send className="w-4 h-4" aria-hidden="true" />发布</button>}
            <button onClick={() => navigate(`/composite-assessments/${id}/results`)} className="hui-button hui-button--secondary">查看结果</button>
            <button onClick={() => void exportData('summary')} className="hui-button hui-button--secondary"><Download className="w-4 h-4" aria-hidden="true" />导出摘要</button>
          </div>
        )}
      />
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {detail.canSetCopyable && (
        <div className="staff-panel staff-panel--padded p-6 mb-5">
          <h2 className="font-semibold mb-2">管理员模板</h2>
          <p className="text-sm text-gray-500 mb-3">
            打开后，教师可把这份已发布综合测评复制成自己的草稿。关闭后立即从教师模板目录消失，已复制的草稿不受影响。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(detail.copyable)}
              disabled={savingCopyable}
              onChange={(e) => void toggleCopyable(e.target.checked)}
            />
            允许教师复制
          </label>
        </div>
      )}
      {reportPackages.length > 0 && (
        <div className="staff-panel staff-panel--padded p-6 mb-5">
          <h2 className="font-semibold mb-2">报告包</h2>
          {reportPackage ? (
            <p className="text-sm text-gray-600 mb-3">
              已选报告包：{selectedPackage?.name ?? reportPackage.key} · v{reportPackage.version} ·
              {reportPackage.profile === 'research' ? ' 科研档' : ' 标准档'}
              {reportPackage.frozen ? ' · 已冻结' : ''}
            </p>
          ) : (
            <p className="text-sm text-gray-600 mb-3">仅显示本人获授权且已发布的固定报告包；自由组合仍保持 collection-only。</p>
          )}
          {isDraft && !packageLocked && (
            <div className="space-y-3">
              <select
                aria-label="编辑报告包"
                value={packageChoice}
                onChange={(e) => {
                  const pkg = reportPackages.find((item) => `${item.key}/${item.version}` === e.target.value)
                  const profile = pkg?.profiles.includes(packageProfile) ? packageProfile : pkg?.profiles[0] ?? 'standard'
                  setPackageChoice(e.target.value)
                  setPackageProfile(profile)
                  setProtocolChoice('')
                }}
                className="block w-full border rounded px-3 py-2 text-base text-gray-800"
              >
                <option value="">仅收集：自由组合，只显示单项结果</option>
                {reportPackages.map((pkg) => <option key={`${pkg.key}/${pkg.version}`} value={`${pkg.key}/${pkg.version}`} disabled={pkg.status !== 'PUBLISHED'}>{pkg.name} · v{pkg.version}{pkg.status !== 'PUBLISHED' ? '（尚未开放）' : ''}</option>)}
              </select>
              {selectedPackage && (
                <div className="rounded border border-emerald-100 bg-emerald-50 p-3 text-sm text-gray-600">
                  <p>{selectedPackage.description}</p>
                  <p className="mt-2">固定槽位：{[...selectedPackage.slots].sort((a, b) => a.position - b.position).map((slot) => slot.label).join(' · ')}</p>
                  <label className="mt-3 block">
                    测验档位
                    <select aria-label="编辑报告包档位" value={packageProfile} onChange={(e) => setPackageProfile(e.target.value as ReportPackageProfile)} className="mt-1 block w-full border rounded bg-white px-3 py-2 text-base text-gray-800">
                      {selectedPackage.profiles.map((profile) => <option key={profile} value={profile}>{profile === 'standard' ? '标准档' : '科研档'}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <button onClick={() => void saveReportPackage()} disabled={savingProtocol || !packageChoice || Boolean(detail.items?.length)} className="hui-button hui-button--secondary">
                {savingProtocol ? '保存中...' : '启用报告包'}
              </button>
              {detail.items?.length > 0 && <p className="text-xs text-amber-600">已有自由组合模块；请先移除全部模块再启用报告包。</p>}
            </div>
          )}
        </div>
      )}
      {!packageCatalogAvailable && reportPackages.length === 0 && <div className="staff-panel staff-panel--padded p-6 mb-5">
        <h2 className="font-semibold mb-2">报告模式</h2>
        {analysisProtocol ? (
          <p className="text-sm text-gray-600 mb-3">
            固定协议：{selectedProtocol?.name ?? analysisProtocol.key} · v{analysisProtocol.version} ·
            {analysisProtocol.profile === 'research' ? ' 科研档' : ' 标准档'}
            {analysisProtocol.frozen ? ' · 已随发布冻结' : ''}
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-3">仅收集：可以自由组合模块，结果只显示各单项，不生成综合分析报告。</p>
        )}
        {isDraft ? (
          <div className="space-y-3">
            <select
              aria-label="编辑报告模式"
              value={protocolChoice}
              onChange={(e) => {
                const protocol = protocols.find((item) => `${item.key}/${item.version}` === e.target.value)
                setProtocolChoice(e.target.value)
                if (protocol && !protocol.profiles.includes(protocolProfile)) {
                  setProtocolProfile(protocol.profiles[0])
                }
              }}
              className="block w-full border rounded px-3 py-2 text-base text-gray-800"
            >
              <option value="">仅收集：自由组合，只显示单项结果</option>
              {analysisProtocol && !protocols.some((protocol) => `${protocol.key}/${protocol.version}` === currentProtocolId) && (
                <option value={currentProtocolId} disabled>{analysisProtocol.key} · v{analysisProtocol.version}（保留现状）</option>
              )}
              {protocols.map((protocol) => (
                <option
                  key={`${protocol.key}/${protocol.version}`}
                  value={`${protocol.key}/${protocol.version}`}
                  disabled={protocol.status !== 'PUBLISHED'}
                >
                  {protocol.name} · v{protocol.version}{protocol.status !== 'PUBLISHED' ? '（尚未开放）' : ''}
                </option>
              ))}
            </select>
            {selectedProtocol && (
              <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm text-gray-600">
                <p>{selectedProtocol.description}</p>
                <p className="mt-2">固定任务：{[
                  ...selectedProtocol.cognitiveSlots,
                  ...(selectedProtocol.scaleSlots ?? []),
                ]
                  .sort((a, b) => a.position - b.position)
                  .map((slot) => slot.label)
                  .join(' · ')}</p>
                <label className="mt-3 block">
                  测验档位
                  <select
                    aria-label="编辑测验档位"
                    value={protocolProfile}
                    onChange={(e) => setProtocolProfile(e.target.value as AnalysisProtocolProfile)}
                    className="mt-1 block w-full border rounded bg-white px-3 py-2 text-base text-gray-800"
                  >
                    {selectedProtocol.profiles.map((profile) => {
                      const minutes = selectedProtocol.estimatedMinutes[profile]
                      return <option key={profile} value={profile}>{profile === 'standard' ? '标准档' : '科研档'} · 约 {minutes[0]}–{minutes[1]} 分钟</option>
                    })}
                  </select>
                </label>
              </div>
            )}
            {!analysisProtocol && detail.items?.length > 0 && protocolChoice && (
              <p className="text-xs text-amber-600">已有自由组合模块的草稿不能直接启用固定协议；请先移除全部模块。</p>
            )}
            <button
              onClick={() => void saveAnalysisProtocol()}
              disabled={
                savingProtocol
                || !protocolSelectionChanged
                || Boolean(!analysisProtocol && detail.items?.length > 0 && protocolChoice)
                || Boolean(protocolChoice && !selectedProtocol)
              }
              className="hui-button hui-button--secondary"
            >
              {savingProtocol ? '保存中...' : '保存报告模式'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">发布后报告模式和协议版本不可更改。</p>
        )}
      </div>}
      <div className="staff-panel staff-panel--padded p-6 mb-5">
        <h2 className="font-semibold mb-4">测评顺序</h2>
        <p className="mb-3 text-xs text-gray-500">量表、认知任务和表单区段的统一顺序请在下方“表单区段”管理器中调整；这里仅移除模块。</p>
        {detail.items?.length ? (
          <div className="space-y-2">
            {detail.items.map((item: any, index: number) => (
              <div key={item.id} className="border rounded px-3 py-3 flex items-center justify-between">
                <div>
                  <span className="text-gray-400 mr-2">{index + 1}.</span>
                  <strong>{itemLabel(item)}</strong>
                  <span className="text-xs text-gray-400 ml-2">{item.type}</span>
                </div>
                {isDraft && !protocolLocked && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => void removeItem(item.id)} className="text-red-500 ml-1" aria-label="移除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">还没有模块</p>
        )}
        {isDraft && protocolLocked && (
          <p className="text-xs text-blue-700 mt-3">固定协议的任务、必答属性和顺序不可单独修改。</p>
        )}
      </div>
      {detail && (
        <FormSectionManager
          basePath={`/composite-assessments/${id}`}
          readOnly={!isDraft || protocolLocked}
        />
      )}
      {isDraft && !protocolLocked && (
        <div className="staff-panel staff-panel--padded p-6 mb-5">
          <h2 className="font-semibold mb-4">添加模块</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            <select value={type} onChange={(e) => { setType(e.target.value as any); setSelectedId('') }} className="border rounded px-3 py-2">
              <option value="SCALE">心理量表</option>
              {cognitiveModuleEnabled && <option value="COGNITIVE">认知任务</option>}
              <option value="SITUATIONAL">文字情境测评</option>
              <option value="FORM">表单</option>
            </select>
            {type !== 'FORM' ? (
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="border rounded px-3 py-2 flex-1">
                <option value="">请选择</option>
                {type === 'SCALE'
                  ? scales.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)
                  : type === 'COGNITIVE'
                    ? cognitiveAssignments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}{item.listedStandalone === false ? '（综合测评用）' : ''}
                    </option>
                      ))
                    : situationalInstruments.map((item) => (
                      <option key={`${item.key}/${item.version}`} value={`${item.key}/${item.version}`}>
                        {item.key} · v{item.version}
                      </option>
                    ))}
              </select>
            ) : (
              <>
                <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="border rounded px-3 py-2 flex-1" placeholder="表单项标签" />
                <select
                  value={formType}
                  onChange={(e) => {
                    const nextType = e.target.value
                    setFormType(formContextKey
                      ? formContextKey === 'birthYearMonth' ? 'year_month' : 'single_choice'
                      : nextType)
                  }}
                  className="border rounded px-3 py-2"
                >
                  <option value="text_input">文本</option>
                  <option value="fill_blank">填空</option>
                  <option value="single_choice">单选</option>
                  <option value="multiple_choice">多选</option>
                  <option value="year_month">年月</option>
                </select>
                <input value={formOptions} onChange={(e) => setFormOptions(e.target.value)} className="border rounded px-3 py-2" placeholder="选项：value=显示文案，用逗号分隔" />
                {formContextKey && contextValueHint(formContextKey) && <p className="text-xs text-blue-600 w-full">{contextValueHint(formContextKey)}</p>}
                <select
                  value={formContextKey}
                  onChange={(e) => {
                    const contextKey = e.target.value
                    setFormContextKey(contextKey)
                    setFormType(contextKey === 'birthYearMonth' ? 'year_month' : contextKey ? 'single_choice' : formType === 'year_month' ? 'fill_blank' : formType)
                    if (contextKey && contextKey !== formContextKey) setFormOptions(serializeDelimitedOptions(contextOptionsForKey(contextKey)))
                  }}
                  className="border rounded px-3 py-2"
                >
                  <option value="">普通表单</option>
                  <option value="birthYearMonth">出生年月</option>
                  <option value="sexAtBirth">出生时性别</option>
                  <option value="gradeLevel">年级</option>
                  <option value="primaryLanguage">主要语言</option>
                  <option value="countryOrRegion">国家/地区</option>
                </select>
                <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                  <input type="checkbox" checked={formRequired} onChange={(e) => setFormRequired(e.target.checked)} />
                  必填
                </label>
              </>
            )}
          </div>
          <button onClick={() => void addItem()} disabled={type !== 'FORM' ? !selectedId : !formLabel} className="hui-button hui-button--primary">
            <Plus className="w-4 h-4 inline mr-1" />添加到末尾
          </button>
        </div>
      )}
      {detail.status === 'PUBLISHED' && isLibraryCourse && (
        <p className="text-sm text-gray-500 mb-5">库课程上的综合测评不能生成公开链接，也不能发给学生作答。</p>
      )}
      {detail.status === 'PUBLISHED' && !isLibraryCourse && <PublicDeliveryManager key={id} family="COMPOSITE" resourceId={id} maximumExpiry={detail.expiresAt} />}

    </ProductPage>
  )
}

export default CompositeAssessmentEdit
