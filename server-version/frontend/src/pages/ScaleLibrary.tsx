import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, CheckCircle, Clock, ExternalLink, FileText, Filter, Lock, Play, ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  getScaleLibrary,
  getScaleLibraryEntry,
  type ScaleLibraryAvailabilityStatus,
  type ScaleLibraryEntry,
  type ScaleLibraryFilters,
  type ScaleLibraryListResponse,
} from '../api/scaleLibrary'

const DOMAIN_OPTIONS = [
  ['WELL_BEING', '身心健康'],
  ['EXECUTIVE_FUNCTION', '执行功能'],
  ['SELF_REGULATION', '自我调节'],
  ['SELF_EFFICACY', '自我效能'],
  ['SOCIAL_EMOTIONAL', '社会情绪'],
  ['BEHAVIORAL_DIFFICULTIES', '行为与困难'],
  ['PARENT_OBSERVATION', '家长观察'],
  ['TEACHER_OBSERVATION', '教师观察'],
] as const

const RESPONDENT_OPTIONS = [
  ['SELF', '自评'],
  ['PARENT', '家长观察'],
  ['TEACHER', '教师观察'],
] as const

const USE_OPTIONS = [
  ['INDIVIDUAL_REFLECTION', '个人反思'],
  ['RESEARCH', '研究'],
  ['PROGRESS_MONITORING', '进展跟踪'],
] as const

const statusLabel: Record<ScaleLibraryAvailabilityStatus, string> = {
  AVAILABLE: '可开始',
  RESTRICTED: '受限',
  NOT_AVAILABLE: '暂不可用',
}

const statusClass: Record<ScaleLibraryAvailabilityStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  RESTRICTED: 'bg-amber-100 text-amber-700',
  NOT_AVAILABLE: 'bg-gray-100 text-gray-600',
}

const respondentLabel = (value: string): string => RESPONDENT_OPTIONS.find(([key]) => key === value)?.[1] ?? value
const domainLabel = (value: string): string => DOMAIN_OPTIONS.find(([key]) => key === value)?.[1] ?? value
const filterLabels: Partial<Record<keyof ScaleLibraryFilters, string>> = {
  keyword: '关键词', respondent: '作答者', availability: '可用性', primaryDomain: '主要构念',
  locale: '内容语言', intendedUse: '用途', minAge: '年龄下界', maxAge: '年龄上界', minGrade: '年级下界', maxGrade: '年级上界',
}
const filterValueLabel = (key: string, value: string | number): string => {
  if (key === 'respondent') return respondentLabel(String(value))
  if (key === 'primaryDomain') return domainLabel(String(value))
  if (key === 'availability') return statusLabel[value as ScaleLibraryAvailabilityStatus] ?? String(value)
  if (key === 'intendedUse') return USE_OPTIONS.find(([option]) => option === value)?.[1] ?? String(value)
  if (key === 'locale' && value === 'zh-CN') return '中文（简体）'
  return String(value)
}

const formatAge = (entry: ScaleLibraryEntry): string => {
  if (entry.applicability.minAge === undefined || entry.applicability.maxAge === undefined) return '年龄边界见说明'
  return `${entry.applicability.minAge}–${entry.applicability.maxAge} 岁`
}

const formatStatus = (value: string): string => ({
  APPROVED: '已批准',
  EVIDENCE_PENDING: '证据待补充（不阻断试行）',
  NOT_GRANTED: '尚无授权记录',
  SCOPE_MISMATCH: '授权范围不匹配',
  INELIGIBLE: '授权当前不可用',
}[value] ?? value)

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center min-h-64 text-gray-500">量表库加载中...</div>
)

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
    <p>{message}</p>
    <button type="button" onClick={onRetry} className="btn-secondary mt-3">重试</button>
  </div>
)

const AvailabilityBadge: React.FC<{ entry: ScaleLibraryEntry }> = ({ entry }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[entry.availability.status]}`}>
    {entry.availability.status === 'AVAILABLE' ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : <ShieldAlert className="mr-1 h-3.5 w-3.5" />}
    {statusLabel[entry.availability.status]}
  </span>
)

const ScaleCard: React.FC<{ entry: ScaleLibraryEntry }> = ({ entry }) => (
  <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{entry.identity.canonicalName}</h2>
        </div>
      </div>
      <BookOpen className="h-6 w-6 shrink-0 text-action" />
    </div>

    <p className="mt-4 text-sm leading-6 text-gray-700">{entry.construct.constructDefinition}</p>
    <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-600">
      <span className="rounded bg-gray-100 px-2 py-1">{domainLabel(entry.construct.primaryDomain)}</span>
      {entry.applicability.respondentTypes.map((respondent) => (
        <span key={respondent} className="rounded bg-gray-100 px-2 py-1">{respondentLabel(respondent)}</span>
      ))}
      <span className="rounded bg-gray-100 px-2 py-1">{formatAge(entry)}</span>
      {entry.applicability.gradeRange && (
        <span className="rounded bg-gray-100 px-2 py-1">{entry.applicability.gradeRange.minGrade}–{entry.applicability.gradeRange.maxGrade} 年级</span>
      )}
      <span className="rounded bg-gray-100 px-2 py-1">{entry.administration.itemCount} 项</span>
      <span className="rounded bg-gray-100 px-2 py-1">约 {entry.administration.estimatedMinutes} 分钟</span>
    </div>

    <div className="mt-4"><AvailabilityBadge entry={entry} /></div>
    {entry.availability.reasons.length > 0 && (
      <p className="mt-4 text-sm text-amber-700">{entry.availability.reasons[0]}</p>
    )}
    <Link
      to={`/scale-library/${encodeURIComponent(entry.identity.instrumentKey)}/${encodeURIComponent(entry.identity.instrumentVersion)}`}
      className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-action hover:underline"
    >
      查看详情 <ExternalLink className="ml-1 h-4 w-4" />
    </Link>
    <details className="mt-3 border-t border-gray-200 pt-2 text-sm text-gray-600">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">版本与证据</summary>
      <p>{entry.identity.abbreviation || entry.identity.instrumentFamily || entry.identity.instrumentKey} · v{entry.identity.instrumentVersion} · {entry.localization.targetLocale}</p>
      <p className="mt-2 leading-6">{entry.evidence.coverageText}</p>
      <p className="mt-2 leading-6">{entry.references.displayText}</p>
    </details>
  </article>
)

const FilterPanel: React.FC<{
  filters: ScaleLibraryFilters
  onChange: (next: ScaleLibraryFilters) => void
  onApply: () => void
  onClear: () => void
}> = ({ filters, onChange, onApply, onClear }) => {
  const update = (key: keyof ScaleLibraryFilters, value: string) => onChange({ ...filters, [key]: value || undefined })
  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onApply() }}
      className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Filter className="h-4 w-4" /> 浏览筛选
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-700 lg:col-span-2">
          关键词
          <input
            value={filters.keyword ?? ''}
            onChange={(event) => update('keyword', event.target.value)}
            placeholder="名称、缩写或构念"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
        </label>
        <label className="text-sm text-gray-700">
          作答者
          <select value={filters.respondent ?? ''} onChange={(event) => update('respondent', event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="">全部</option>
            {RESPONDENT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          可用性
          <select value={filters.availability ?? ''} onChange={(event) => update('availability', event.target.value as ScaleLibraryAvailabilityStatus)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="">全部状态</option>
            <option value="AVAILABLE">可开始</option>
            <option value="RESTRICTED">受限</option>
            <option value="NOT_AVAILABLE">暂不可用</option>
          </select>
        </label>
      </div>
      <details className="mt-4 border-t border-gray-200 pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-gray-700">更多筛选</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-700">
          主要构念
          <select value={filters.primaryDomain ?? ''} onChange={(event) => update('primaryDomain', event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="">全部</option>
            {DOMAIN_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          内容语言
          <select value={filters.locale ?? ''} onChange={(event) => update('locale', event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="">全部语言</option>
            <option value="zh-CN">中文（简体）</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="text-sm text-gray-700">
          用途
          <select value={filters.intendedUse ?? ''} onChange={(event) => update('intendedUse', event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
            <option value="">全部用途</option>
            {USE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          年龄下界
          <input type="number" min="0" max="100" value={filters.minAge ?? ''} onChange={(event) => onChange({ ...filters, minAge: event.target.value ? Number(event.target.value) : undefined })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          年龄上界
          <input type="number" min="0" max="100" value={filters.maxAge ?? ''} onChange={(event) => onChange({ ...filters, maxAge: event.target.value ? Number(event.target.value) : undefined })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          年级下界
          <input type="number" min="1" max="12" value={filters.minGrade ?? ''} onChange={(event) => onChange({ ...filters, minGrade: event.target.value ? Number(event.target.value) : undefined })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          年级上界
          <input type="number" min="1" max="12" value={filters.maxGrade ?? ''} onChange={(event) => onChange({ ...filters, maxGrade: event.target.value ? Number(event.target.value) : undefined })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
      </div>
      </details>
      <div className="mt-5 flex gap-3">
        <button type="submit" className="min-h-11 rounded-md bg-action px-4 py-2 text-sm font-medium text-white hover:opacity-90">应用筛选</button>
        <button type="button" onClick={onClear} className="min-h-11 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">清除全部</button>
      </div>
    </form>
  )
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="text-base font-semibold text-gray-900">{title}</h2>
    <div className="mt-3 text-sm leading-6 text-gray-700">{children}</div>
  </section>
)

const DetailPage: React.FC<{ entry: ScaleLibraryEntry }> = ({ entry }) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <div>
      <Link to="/scale-library" className="mb-5 inline-flex min-h-11 items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="mr-1 h-4 w-4" /> 返回量表库
      </Link>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{entry.identity.canonicalName}</h1>
              <AvailabilityBadge entry={entry} />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {entry.identity.abbreviation || entry.identity.instrumentFamily} · v{entry.identity.instrumentVersion} · {entry.localization.targetLocale}
            </p>
          </div>
          {user?.role === 'STUDENT' && entry.availability.status === 'AVAILABLE' && entry.availability.launch && (
            <button type="button" onClick={() => navigate(entry.availability.launch!.route)} className="inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              <Play className="mr-2 h-4 w-4" /> 开始量表
            </button>
          )}
        </div>
        {entry.availability.status !== 'AVAILABLE' && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center font-medium"><Lock className="mr-2 h-4 w-4" />当前不可开始</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {entry.availability.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="测量内容">
          <p>{entry.construct.constructDefinition}</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-gray-500">主要构念</dt><dd>{domainLabel(entry.construct.primaryDomain)}</dd></div>
            <div><dt className="text-gray-500">构念层级</dt><dd>{entry.construct.constructLevel}</dd></div>
            <div><dt className="text-gray-500">维度数量</dt><dd>{entry.report.scoreCount}</dd></div>
            <div><dt className="text-gray-500">作答者</dt><dd>{entry.applicability.respondentTypes.map(respondentLabel).join('、')}</dd></div>
          </dl>
        </Section>
        <Section title="适用范围">
          <p>{formatAge(entry)}{entry.applicability.gradeRange ? `；${entry.applicability.gradeRange.minGrade}–${entry.applicability.gradeRange.maxGrade} 年级` : ''}</p>
          {entry.applicability.populationNotes && <p className="mt-2">{entry.applicability.populationNotes}</p>}
          <p className="mt-2 text-gray-500">发展证据状态：{entry.applicability.developmentalEvidence}</p>
        </Section>
        <Section title="施测方式">
          <div className="flex flex-wrap gap-4">
            <span className="inline-flex items-center"><FileText className="mr-1 h-4 w-4" />{entry.administration.itemCount} 项</span>
            <span className="inline-flex items-center"><Clock className="mr-1 h-4 w-4" />约 {entry.administration.estimatedMinutes} 分钟</span>
          </div>
          <p className="mt-2">{entry.administration.timeFrame}；{entry.administration.administrationModes.join('、')}</p>
          <p className="mt-2">施测培训：{entry.administration.requiredTraining ? '需要' : '不需要'}。</p>
        </Section>
        <Section title="用途与限制">
          <p className="font-medium">可用用途</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{entry.intendedUse.intendedUses.map((use) => <li key={use.use}>{use.use}（{use.evidenceStatus}）{use.notes ? `：${use.notes}` : ''}</li>)}</ul>
          <p className="mt-3 font-medium">不适用用途</p>
          <p>{entry.intendedUse.forbiddenUses.join('、')}</p>
        </Section>
        <Section title="语言与来源">
          <p>当前内容：{entry.localization.targetLocale}；来源语言：{entry.localization.sourceLocale}；版本 {entry.localization.localizationVersion}。</p>
          <p className="mt-2">适配方式：{entry.localization.adaptationMethod}；审核状态：{entry.localization.reviewStatus}。</p>
          {entry.source.citation && <p className="mt-2">{entry.source.citation}</p>}
          {entry.source.url && <a className="mt-2 inline-flex items-center text-action hover:underline" href={entry.source.url} target="_blank" rel="noreferrer">查看来源 <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>}
        </Section>
        <Section title="授权与参考">
          <p>授权状态：{formatStatus(entry.rights.status)}；商业性质：{entry.rights.commercialNature}。</p>
          <p className="mt-2">覆盖语言：{entry.rights.locales.length > 0 ? entry.rights.locales.join('、') : '暂无可用授权范围'}；适用地区：{entry.rights.territories.length > 0 ? entry.rights.territories.join('、') : '暂无'}</p>
          <p className="mt-3">{entry.references.displayText}</p>
          <p className="mt-1 text-gray-500">参考版本 {entry.references.packageReferenceCount} 个；适用性记录 {entry.references.applicabilityCount} 条。</p>
        </Section>
        <Section title="报告说明">
          {entry.report.maxEligibleLevel === null ? (
            <p>当前仅展示报告设计预览，暂不能生成个人结果。需完成量表版本确认、授权和报告审核后才能启用。</p>
          ) : (
            <p>本量表提供分数与维度解释、教育性引导、限制说明和免责声明；报告不会把描述性分数升级为诊断结论。</p>
          )}
          <p className="mt-2">维度：{entry.report.dimensionLabels.join('、')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{entry.report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          <p className="mt-3 rounded-md bg-gray-50 p-3 text-gray-600">{entry.report.disclaimer}</p>
        </Section>
        <Section title="证据摘要">
          <p>{entry.evidence.coverageText}</p>
          <p className="mt-2 text-gray-500">科学证据记录数：{entry.evidence.recordCount}。</p>
        </Section>
      </div>

      {user?.role === 'ADMIN' && entry.governance && (
        <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
          <h2 className="text-base font-semibold text-purple-900">治理详情（管理员）</h2>
          <div className="mt-3 grid gap-2 text-sm text-purple-900 sm:grid-cols-2">
            <p>科学成熟度：{entry.governance.scientificMaturity}</p>
            <p>目录状态：{entry.governance.catalogStatus}</p>
            <p>量表包状态：{entry.governance.packageReleaseStatus}</p>
            <p>发布门：{entry.governance.gate.publishable ? '通过' : '未通过'}</p>
          </div>
          {entry.governance.gate.errors.length > 0 && <p className="mt-3 text-sm text-red-700">{entry.governance.gate.errors.join('；')}</p>}
          {entry.governance.gate.warnings.length > 0 && <p className="mt-2 text-sm text-amber-700">{entry.governance.gate.warnings.join('；')}</p>}
          <div className="mt-4 overflow-auto rounded-md bg-white/70 p-3 text-sm">
            {entry.governance.evidence.map((record) => <p key={record.evidenceId}>{record.evidenceId} · {record.evidenceType} · {record.rating} · {record.citation}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}

const ScaleLibrary: React.FC = () => {
  const { instrumentKey, instrumentVersion } = useParams<{ instrumentKey?: string; instrumentVersion?: string }>()
  const isDetail = Boolean(instrumentKey && instrumentVersion)
  const [listData, setListData] = useState<ScaleLibraryListResponse | null>(null)
  const [detail, setDetail] = useState<ScaleLibraryEntry | null>(null)
  const [filters, setFilters] = useState<ScaleLibraryFilters>({})
  const [appliedFilters, setAppliedFilters] = useState<ScaleLibraryFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRequest = useRef(0)

  const load = useCallback(() => {
    const request = ++loadRequest.current
    setLoading(true)
    setError(null)
    if (isDetail && instrumentKey && instrumentVersion) {
      getScaleLibraryEntry(instrumentKey, instrumentVersion, {
        locale: appliedFilters.locale,
        territory: appliedFilters.territory,
        respondent: appliedFilters.respondent,
      })
        .then((response) => {
          if (request !== loadRequest.current) return
          if (response.code !== 0 || !response.data?.entry) throw new Error(response.message || '量表详情加载失败')
          setDetail(response.data.entry)
        })
        .catch((reason: unknown) => { if (request === loadRequest.current) setError(reason instanceof Error ? reason.message : '量表详情加载失败') })
        .finally(() => { if (request === loadRequest.current) setLoading(false) })
      return
    }
    getScaleLibrary(appliedFilters)
      .then((response) => {
        if (request !== loadRequest.current) return
        if (response.code !== 0 || !response.data) throw new Error(response.message || '量表库加载失败')
        setListData(response.data)
      })
      .catch((reason: unknown) => { if (request === loadRequest.current) setError(reason instanceof Error ? reason.message : '量表库加载失败') })
      .finally(() => { if (request === loadRequest.current) setLoading(false) })
  }, [appliedFilters, instrumentKey, instrumentVersion, isDetail])

  useEffect(() => { load(); return () => { loadRequest.current += 1 } }, [load])

  if (isDetail) return <div className="hui-scale-library hui-scale-library--detail">{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : detail ? <DetailPage entry={detail} /> : <ErrorState message="量表详情不存在" onRetry={load} />}</div>

  const entries = listData?.entries ?? []
  const activeFilters = Object.entries(appliedFilters).filter(([, value]) => value !== undefined && value !== '')
  const clearFilters = () => { setFilters({}); setAppliedFilters({}) }
  return (
    <div className="hui-scale-library">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">量表库</h1>
        <p className="mt-1 text-gray-600">浏览可用量表与研究候选量表，了解适用范围、证据和使用限制。只有标注“可开始”的量表能够进入测评。</p>
      </div>
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onApply={() => setAppliedFilters(filters)}
        onClear={clearFilters}
      />
      {activeFilters.length > 0 && <div className="mb-4 flex flex-wrap gap-2" aria-label="已应用筛选">
        {activeFilters.map(([key, value]) => <button key={key} type="button"
          className="min-h-11 max-w-full break-words rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700"
          aria-label={`移除${filterLabels[key as keyof ScaleLibraryFilters] ?? key}：${filterValueLabel(key, value!)}`}
          onClick={() => { setFilters({ ...filters, [key]: undefined }); setAppliedFilters({ ...appliedFilters, [key]: undefined }) }}>
          {filterLabels[key as keyof ScaleLibraryFilters] ?? key}：{filterValueLabel(key, value!)} <span aria-hidden="true">×</span>
        </button>)}
      </div>}
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : <>
      <p className="mb-4 text-sm text-gray-600" role="status">当前显示 {entries.length} 个量表</p>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-gray-400" />
          <p className="text-gray-600">没有符合条件的量表</p>
          <p className="mt-1 text-sm text-gray-600">可以清除筛选后重新浏览。</p>
          {activeFilters.length > 0 && <button type="button" className="btn-secondary mt-4" onClick={clearFilters}>清除筛选并浏览全部</button>}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">{entries.map((entry) => <ScaleCard key={`${entry.identity.instrumentKey}:${entry.identity.instrumentVersion}`} entry={entry} />)}</div>
      )}
      </>}
    </div>
  )
}

export default ScaleLibrary
