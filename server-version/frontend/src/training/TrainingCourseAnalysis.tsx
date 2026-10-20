import {TrainingReferenceStudio,type TrainingReferenceReady} from './TrainingReferenceStudio'
import FormalReferenceStudio,{FormalReferenceSubmission} from './FormalReferenceStudio'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { sessionFetch } from '../api/client'
import {
  trainingAnalysisApi,
  type TrainingAnalysisSource,
  type TrainingAnalysisSelector,
  type TrainingAnalysisMode,
  type TrainingAnalysisResult,
  type TrainingAnalysisQualityRow,
  type TrainingAnalysisQualityPage,
} from '../api/trainingAnalysis'
import {
  requestExportIntent, waitForExportArtifacts, assertExportDownload,
  triggerExportDownload, clearExportIntentKey, ExportJobFailedError,
} from '../utils/exportJobs'
import './training-course-analysis.css'

type WaveDraft = { id: number; waveKey: string; taskId: string; version: string; sourceKey: string; metricKeys: string[] }
type ResultSnapshot = { selector: TrainingAnalysisSelector; result: TrainingAnalysisResult }
const newWave = (id: number): WaveDraft => ({ id, waveKey: id === 1 ? 'baseline' : id === 2 ? 'followup' : `followup_${id - 1}`, taskId: '', version: '', sourceKey: '', metricKeys: [] })
const sourceKey = (source: TrainingAnalysisSource) => JSON.stringify([source.taskId, source.publication, source.configDigest, source.variantKey, ...(source.materialGroupKey === undefined ? [] : [source.materialGroupKey])])
const versionKey = (source: TrainingAnalysisSource) => JSON.stringify([source.publication, source.configDigest])
const metricKey = (metric: { itemId: string; metricKey: string }) => JSON.stringify([metric.itemId, metric.metricKey])
const displayNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '—'
const errorStatus = (error: unknown) => {
  const cause = error as { status?: number; code?: number | string; response?: { status?: number } }
  return cause?.status ?? cause?.response?.status ?? (typeof cause?.code === 'number' ? cause.code : undefined)
}
const explainError = (error: unknown) => {
  const message = (error as { message?: unknown })?.message
  if (errorStatus(error) === 403) return '当前账号没有本课程数据分析权限。课程共享或模板使用授权不包含结果、质量判断与导出权限。'
  if (errorStatus(error) === 409) return `${typeof message === 'string' ? message + '。' : '来源、权限或质量版本已变化，或同一学员存在无法唯一确定的记录。'}请刷新来源并重新分析；系统不会自动挑选一条记录。`
  return typeof message === 'string' ? message : '请求失败，请重试。'
}
const missingReasonLabels: Record<string, string> = {
  QUALITY_EXCLUDED: '质量判断排除', NOT_COMPARABLE: '不可比较', NOT_ASSIGNED: '未分配', UNANSWERED: '未回答',
  NON_FINAL: '未最终提交', NOT_ATTEMPTED: '未开始', INVALID_VALUE: '无效数值', MISSING_SOURCE: '来源缺失',
  NOT_CALCULABLE: '无法计算数值', NO_OBSERVATION: '本波次未观察到记录', LEGACY_UNSCOPED: '历史记录无法确定范围', IDENTITY_UNAVAILABLE: '身份无法可靠匹配',
}

function QualityEditor({ row, disabled, onSave }: { row: TrainingAnalysisQualityRow; disabled: boolean; onSave: (row: TrainingAnalysisQualityRow, verdict: 'INCLUDE' | 'EXCLUDE', reason: string) => void }) {
  const [verdict, setVerdict] = useState(row.verdict)
  const [reason, setReason] = useState(row.reason || '')
  const changed = verdict !== row.verdict || reason.trim() !== (row.reason || '')
  const readOnly = disabled || row.status !== 'COMPLETED'
  return <form className="training-analysis-quality-row" onSubmit={event => { event.preventDefault(); if (!readOnly && changed && reason.trim().length >= 2) onSave(row, verdict, reason.trim()) }}>
    <p>作答记录：{row.attemptId} · 轮次 {row.attemptEpoch} · 质量修订 {row.revision}</p>
    <p>原始提交状态：{row.status} · 任务完成判定：{row.taskSatisfaction || '未提供'}</p>
    {row.status !== 'COMPLETED' && <p>只有已完成的冻结作答可复核质量。</p>}
    <label>分析质量判断
      <select aria-label={`${row.attemptId} 的质量判断`} value={verdict} disabled={readOnly} onChange={event => setVerdict(event.target.value as 'INCLUDE' | 'EXCLUDE')}>
        <option value="INCLUDE">纳入分析</option><option value="EXCLUDE">排除分析</option>
      </select>
    </label>
    <label>判断依据
      <input aria-label={`${row.attemptId} 的判断依据`} value={reason} minLength={2} maxLength={1000} required disabled={readOnly} onChange={event => setReason(event.target.value)} />
    </label>
    <button type="submit" disabled={readOnly || !changed || reason.trim().length < 2}>保存质量判断</button>
  </form>
}

/** Course-scoped discovery is the only picker authority. No raw observations,
 * unscoped workbench data or client-side cohort/statistical reconstruction. */
export default function TrainingCourseAnalysis({ courseId,actorId }: { courseId: string;actorId?:string }) {
  const [referenceLocked,setReferenceLocked]=useState(false)
  const referenceRisk=useCallback((locked:boolean)=>setReferenceLocked(locked),[])
  const [formalSubmissionLocked,setFormalSubmissionLocked]=useState(false),[formalGovernanceLocked,setFormalGovernanceLocked]=useState(false)
  const submissionRisk=useCallback((locked:boolean)=>setFormalSubmissionLocked(locked),[]),governanceRisk=useCallback((locked:boolean)=>setFormalGovernanceLocked(locked),[])
  const [referenceReady,setReferenceReady]=useState<TrainingReferenceReady|null>(null)
  const scientificLocked=referenceLocked||formalSubmissionLocked||formalGovernanceLocked
  const [sources, setSources] = useState<TrainingAnalysisSource[]>([])
  const [permissions, setPermissions] = useState({ canQuality: false, canExport: false })
  const [loading, setLoading] = useState(true)
  const [sourceError, setSourceError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [waves, setWaves] = useState<WaveDraft[]>([newWave(1), newWave(2)])
  const nextWaveId = useRef(3)
  const [mode, setMode] = useState<TrainingAnalysisMode>('PAIRWISE')
  const [snapshot, setSnapshot] = useState<ResultSnapshot | null>(null)
  const [quality, setQuality] = useState<TrainingAnalysisQualityPage | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [operationError, setOperationError] = useState('')
  const [layout, setLayout] = useState<'long' | 'wide' | 'dictionary'>('long')
  const [format, setFormat] = useState<'csv' | 'zip'>('csv')
  const epoch = useRef(0)
  const operation = useRef(false)

  useEffect(() => {
    const requestEpoch = ++epoch.current
    operation.current = false
    setBusy(false); setPermissions({ canQuality: false, canExport: false }); setSources([]); setLoading(true); setSourceError(''); setSnapshot(null); setQuality(null)
    setWaves([newWave(1), newWave(2)]); nextWaveId.current = 3
    setNotice(''); setOperationError(''); setReferenceReady(null)
    void trainingAnalysisApi.sources(courseId).then(data => {
      if (epoch.current === requestEpoch) {
        setSources(data.list); setPermissions({ canQuality: data.canQuality === true, canExport: data.canExport === true })
      }
    }).catch(error => {
      if (epoch.current === requestEpoch) setSourceError(explainError(error))
    }).finally(() => { if (epoch.current === requestEpoch) setLoading(false) })
    return () => { epoch.current = requestEpoch + 1 }
  }, [actorId, courseId, refresh])

  function invalidate() { setSnapshot(null); setQuality(null); setNotice(''); setOperationError('') }
  function updateWave(id: number, patch: Partial<WaveDraft>) {
    if (scientificLocked || operation.current) return
    setWaves(previous => previous.map(wave => wave.id === id ? { ...wave, ...patch } : wave)); invalidate()
  }
  const tasks = Array.from(new Map(sources.map(source => [source.taskId, source.taskName])).entries())
  const validWaves = waves.every(wave => wave.waveKey.trim() && wave.metricKeys.length > 0 && sources.some(source => sourceKey(source) === wave.sourceKey))
    && new Set(waves.map(wave => wave.waveKey.trim())).size === waves.length && (mode === 'FULL_CASE' || waves.length === 2)

  async function analyze(event: FormEvent) {
    event.preventDefault()
    if (scientificLocked || operation.current || !validWaves) return
    const selector: TrainingAnalysisSelector = { schemaVersion: 1, courseId, mode, waves: waves.map(wave => {
      const source = sources.find(candidate => sourceKey(candidate) === wave.sourceKey)!
      return { waveKey: wave.waveKey.trim(), taskId: source.taskId, publication: source.publication, configDigest: source.configDigest,
        variantKey: source.variantKey, ...(source.materialGroupKey === undefined ? {} : { materialGroupKey: source.materialGroupKey }), metrics: source.metrics.filter(metric => wave.metricKeys.includes(metricKey(metric))).map(({ itemId, metricKey: key }) => ({ itemId, metricKey: key })) }
    }) }
    operation.current = true; setBusy(true); invalidate()
    const requestEpoch = epoch.current
    try {
      const result = await trainingAnalysisApi.analyze(courseId, selector)
      if (epoch.current !== requestEpoch) return
      setSnapshot({ selector, result }); setQuality(result.quality); setNotice('分析已更新，导出将绑定本次来源与质量版本。')
    } catch (error) { if (epoch.current === requestEpoch) setOperationError(explainError(error)) }
    finally { if (epoch.current === requestEpoch) { operation.current = false; setBusy(false) } }
  }

  async function saveQuality(row: TrainingAnalysisQualityRow, verdict: 'INCLUDE' | 'EXCLUDE', reason: string) {
    if (scientificLocked || operation.current || !snapshot || !permissions.canQuality) return
    operation.current = true; setBusy(true); setOperationError(''); setNotice('正在保存质量判断并更新分析…')
    const requestEpoch = epoch.current
    const { selector } = snapshot
    setSnapshot(null); setQuality(null)
    let saved = false
    try {
      await trainingAnalysisApi.updateQuality(courseId, { selector, attemptId: row.attemptId, attemptEpoch: row.attemptEpoch,
        sourceHash: row.sourceHash, expectedRevision: row.revision, verdict, reason })
      saved = true
      if (epoch.current !== requestEpoch) return
      const result = await trainingAnalysisApi.analyze(courseId, selector)
      if (epoch.current !== requestEpoch) return
      setSnapshot({ selector, result }); setQuality(result.quality); setNotice('质量判断已保存，分析已按新版本更新。原始得分与任务完成状态保持原样。')
    } catch (error) { if (epoch.current === requestEpoch) { setNotice(saved ? '质量判断已保存，但分析尚未刷新。请重新生成分析。' : ''); setOperationError(explainError(error)) } }
    finally { if (epoch.current === requestEpoch) { operation.current = false; setBusy(false) } }
  }

  async function changeQualityPage(page: number) {
    if (scientificLocked || operation.current || !snapshot) return
    operation.current = true; setBusy(true); setOperationError('')
    const requestEpoch = epoch.current
    try {
      const data = await trainingAnalysisApi.qualityPage(courseId, snapshot.selector, snapshot.result.manifest, page)
      if (epoch.current === requestEpoch) setQuality(data)
    } catch (error) {
      if (epoch.current === requestEpoch) {
        setOperationError(explainError(error))
        if ([403, 409].includes(errorStatus(error) || 0)) { setSnapshot(null); setQuality(null) }
      }
    } finally { if (epoch.current === requestEpoch) { operation.current = false; setBusy(false) } }
  }

  async function exportData() {
    if (scientificLocked || operation.current || !snapshot || !permissions.canExport) return
    operation.current = true; setBusy(true); setOperationError(''); setNotice('正在提交导出任务…')
    const requestEpoch = epoch.current
    const { selector, result: { manifest } } = snapshot
    const scope = `training-analysis:${courseId}:${manifest.manifestHash}:${layout}:${format}`
    try {
      const response = await requestExportIntent(scope, requestKey => trainingAnalysisApi.exportData(courseId, { selector, manifest, layout, format, requestKey }))
      if (epoch.current !== requestEpoch) return
      setNotice('导出已进入原有队列，正在生成文件。')
      const artifacts = await waitForExportArtifacts(response.artifacts)
      if (epoch.current !== requestEpoch) return
      for (const artifact of artifacts) {
        const download = await sessionFetch(artifact.downloadUrl, { signal: AbortSignal.timeout(60000) })
        if (download.status === 403) throw Object.assign(new Error('当前导出访问权限已变化'), { status: 403 })
        assertExportDownload(download)
        const blob = await download.blob()
        if (epoch.current !== requestEpoch) return
        triggerExportDownload(blob, artifact.fileName)
      }
      clearExportIntentKey(scope); setNotice('已请求下载，请查看浏览器下载列表。')
    } catch (error) {
      if (error instanceof ExportJobFailedError) clearExportIntentKey(scope)
      if (epoch.current === requestEpoch) {
        setNotice(''); setOperationError(explainError(error))
        if ([403, 409].includes(errorStatus(error) || 0) || error instanceof ExportJobFailedError) { setSnapshot(null); setQuality(null) }
      }
    } finally { if (epoch.current === requestEpoch) { operation.current = false; setBusy(false) } }
  }

  return <section className="training-detail-content training-course-analysis" aria-label="课程数据分析">
    <h2>课程数据分析</h2>
    <p>为基线与随访选择明确的任务、发布版本、分组和数值指标。仅使用服务器返回的当前课程授权来源。</p>
    <p className="training-science-note">课程共享、模板使用权不自动授予结果或原始数据权限。质量判断只改变分析纳入范围，不改写原始得分或任务完成状态。</p>
    <button type="button" disabled={scientificLocked || busy || loading} onClick={() => setRefresh(value => value + 1)}>刷新分析来源</button>
    {loading ? <p role="status">正在核对本课程分析权限与来源…</p>
      : sourceError ? <p role="alert">{sourceError}</p>
        : sources.length === 0 ? <p className="training-empty-small">当前没有可分析的授权数值来源。已发布课程任务不一定具备分析所需的数据与权限。</p>
          : <form onSubmit={event => void analyze(event)}>
            <div className="training-analysis-waves">{waves.map((wave, index) => {
              const versions = Array.from(new Map(sources.filter(source => source.taskId === wave.taskId).map(source => [versionKey(source), source])).entries())
              const variants = sources.filter(source => source.taskId === wave.taskId && versionKey(source) === wave.version)
              const source = variants.find(candidate => sourceKey(candidate) === wave.sourceKey)
              return <fieldset key={wave.id} disabled={scientificLocked || busy} className="training-analysis-wave">
                <legend>{index === 0 ? '基线' : `随访 ${index}`}来源</legend>
                <label>波次标识<input value={wave.waveKey} maxLength={64} aria-label={`波次 ${index + 1} 标识`} onChange={event => updateWave(wave.id, { waveKey: event.target.value })} required /></label>
                <label>任务<select aria-label={`波次 ${index + 1} 任务`} value={wave.taskId} onChange={event => updateWave(wave.id, { taskId: event.target.value, version: '', sourceKey: '', metricKeys: [] })} required>
                  <option value="">选择当前课程任务</option>{tasks.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select></label>
                <label>发布版本与配置<select aria-label={`波次 ${index + 1} 发布版本`} value={wave.version} disabled={scientificLocked || busy || !wave.taskId} onChange={event => updateWave(wave.id, { version: event.target.value, sourceKey: '', metricKeys: [] })} required>
                  <option value="">选择冻结版本</option>{versions.map(([key, item]) => <option key={key} value={key}>{item.publication} · {item.configDigest || '无分组配置'}</option>)}
                </select></label>
                <label>分组<select aria-label={`波次 ${index + 1} 分组`} value={wave.sourceKey} disabled={scientificLocked || busy || !wave.version} onChange={event => updateWave(wave.id, { sourceKey: event.target.value, metricKeys: [] })} required>
                  <option value="">选择分组</option>{variants.map(item => <option key={sourceKey(item)} value={sourceKey(item)}>{item.materialGroupKey ? `实验材料组 · ${item.materialGroupKey}` : item.variantKey || '未分组'}</option>)}
                </select></label>
                {source && <fieldset className="training-analysis-metrics"><legend>数值指标</legend>{source.metrics.length === 0 ? <p>这个来源没有可分析的数值指标。</p> : source.metrics.map(metric => <label key={metricKey(metric)}>
                  <input type="checkbox" checked={wave.metricKeys.includes(metricKey(metric))} disabled={scientificLocked || busy || (!wave.metricKeys.includes(metricKey(metric)) && wave.metricKeys.length >= 64)} onChange={event => updateWave(wave.id, { metricKeys: event.target.checked ? [...wave.metricKeys, metricKey(metric)] : wave.metricKeys.filter(key => key !== metricKey(metric)) })} />
                  {metric.label || metric.metricKey} <small>（{metric.itemId}）</small>
                </label>)}</fieldset>}
                {waves.length > 2 && <button type="button" onClick={() => { setWaves(previous => previous.filter(item => item.id !== wave.id)); invalidate() }}>移除此波次</button>}
              </fieldset>
            })}</div>
            <div className="training-analysis-controls">
              <button type="button" disabled={scientificLocked || busy || mode !== 'FULL_CASE' || waves.length >= 8} onClick={() => { setWaves(previous => [...previous, newWave(nextWaveId.current++)]); invalidate() }}>添加随访波次</button>
              <label>匹配方式<select value={mode} disabled={scientificLocked || busy} onChange={event => { setMode(event.target.value as TrainingAnalysisMode); invalidate() }}>
                <option value="PAIRWISE">逐对匹配（PAIRWISE）</option><option value="FULL_CASE">全波次完整个案（FULL_CASE）</option>
              </select></label>
              <button type="submit" className="training-action" disabled={scientificLocked || busy || !validWaves}>{busy ? '处理中…' : '生成课程分析'}</button>
            </div>
            <p>逐对匹配需要两个波次；全波次完整个案支持 2–8 个波次。波次标识须唯一。每波最多 64 个指标。缺失、排除与不可比较记录不填零；同一身份的多条候选记录不会自动取最新一条。</p>
          </form>}
    {actorId&&!loading&&<>
      <TrainingReferenceStudio key={actorId+':'+courseId} actorId={actorId} courseId={courseId} sources={sources}
        disabled={busy||Boolean(sourceError)||formalSubmissionLocked||formalGovernanceLocked} onRiskChange={referenceRisk} onCandidateReady={setReferenceReady}/>
      {referenceReady&&<FormalReferenceSubmission key={actorId+':'+referenceReady.candidate.candidateId} actorId={actorId} product="TRAINING"
        candidateId={referenceReady.candidate.candidateId} candidateHash={referenceReady.candidate.candidateHash} analyzeGrantId={referenceReady.analyzeGrantId}
        disabled={!referenceReady.verified||busy||referenceLocked||formalGovernanceLocked} onRiskChange={submissionRisk}/>}
    </>}
    {actorId&&<FormalReferenceStudio key={actorId+':formal-governance'} actorId={actorId} disabled={busy||referenceLocked||formalSubmissionLocked} onRiskChange={governanceRisk}/>}
    {operationError && <p role="alert">{operationError}</p>}
    {notice && <p role="status">{notice}</p>}
    {snapshot && <>
      <section aria-label="课程分析结果" className="training-analysis-results">
        <h3>描述统计与配对结果</h3>
        <p>最小披露人数：{snapshot.result.analysis.minimumN}。小样本及受保护单元显示为隐藏，不从其他单元反推。</p>
        {snapshot.result.analysis.state === 'suppressed' && <p>本次分析未达到披露条件，部分或全部统计已隐藏。</p>}
        <p>匹配方式：{snapshot.result.analysis.mode} · 匹配候选人数：{displayNumber(snapshot.result.analysis.matchedEligibleN)}</p>
        <div className="training-analysis-table" tabIndex={0} role="region" aria-label="各波次描述统计"><table>
          <caption>各波次数值分布</caption><thead><tr><th scope="col">波次 / 指标</th><th scope="col">有效人数 validN</th><th scope="col">均值</th><th scope="col">中位数</th><th scope="col">样本标准差</th><th scope="col">最小 / 最大</th><th scope="col">四分位数 Q1 / Q3</th></tr></thead>
          <tbody>{snapshot.result.analysis.descriptives.map((metric, index) => <tr key={`${metric.waveKey}:${metric.itemId}:${metric.metricKey}:${index}`}>
            <th scope="row">{metric.waveKey} / {metric.metricKey}<small>{metric.itemId}</small></th>
            {metric.state === 'suppressed' ? <td colSpan={6}>未达到披露条件</td> : <><td>{displayNumber(metric.validN)}</td><td>{displayNumber(metric.statistics?.mean)}</td><td>{displayNumber(metric.statistics?.median)}</td><td>{displayNumber(metric.statistics?.sdSample)}</td><td>{displayNumber(metric.statistics?.minMax?.min)} / {displayNumber(metric.statistics?.minMax?.max)}</td><td>{displayNumber(metric.statistics?.quartiles?.q1)} / {displayNumber(metric.statistics?.quartiles?.q3)}</td></>}
          </tr>)}</tbody>
        </table></div>
        {snapshot.result.analysis.descriptives.filter(metric => metric.state === 'present' && metric.missingByReason).map((metric, index) => <p key={`missing:${index}`}>
          {metric.waveKey} / {metric.metricKey} 缺失与排除：{Object.entries(metric.missingByReason || {}).map(([reason, count]) => `${missingReasonLabels[reason] || reason} ${count}`).join('；') || '无可披露的缺失计数'}
        </p>)}
        {snapshot.result.analysis.metrics.map((metric, index) => <article key={`${metric.metricKey}:${index}`} className="training-analysis-matched">
          <h4>{metric.metricKey}</h4>
          {metric.state === 'suppressed' ? <p>配对结果未达到披露条件。</p> : metric.state === 'not_comparable' ? <p>不可比较：{missingReasonLabels[metric.reason || 'NOT_COMPARABLE'] || metric.reason}。不会将不同计分含义的指标合并。</p> : <>
            <p>{metric.countKind === 'COMPLETE_CASE' ? '完整个案人数 completeCaseN' : '配对有效人数 pairedN'}：{displayNumber(metric.validCaseN)}</p>
            {metric.waveMeans?.map(wave => <p key={wave.waveId}>{wave.waveKey} 配对均值：{displayNumber(wave.mean)}</p>)}
          </>}
          {metric.comparisons?.map((comparison, comparisonIndex) => <p key={comparisonIndex}>
            {comparison.fromWaveId} → {comparison.toWaveId}：{comparison.comparability.level}
            {metric.state === 'present' && comparison.delta !== undefined && ` · 均值变化 ${displayNumber(comparison.delta)}`}
            {comparison.comparability.limitations.length > 0 && ` · ${comparison.comparability.limitations.join('；')}`}
          </p>)}
          {metric.flow && metric.flow.length > 0 && <p>样本流转按已观察样本计算，非招募人数或质量合格率。</p>}
          {metric.flow?.map((flow, flowIndex) => <p key={`flow:${flowIndex}`}>
            {flow.fromWaveKey} → {flow.toWaveKey}：{flow.state === 'suppressed' ? '样本流失与新加入人数受披露条件保护。' : `前波已观察 ${displayNumber(flow.fromObservedN)}；后波已观察 ${displayNumber(flow.toObservedN)}；保留 ${displayNumber(flow.retainedN)}；后续未观察到 ${displayNumber(flow.attritionN)}；后续新观察到 ${displayNumber(flow.lateJoiningN)}`}
          </p>)}
        </article>)}
        {snapshot.result.analysis.limitations.length > 0 && <ul aria-label="分析限制">{snapshot.result.analysis.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
        <details><summary>本次分析来源凭据</summary><p>来源截止：{snapshot.result.manifest.sourceCutoff}</p><p>分析清单：{snapshot.result.manifest.manifestHash}</p><p>质量版本：{snapshot.result.manifest.qualityHash}</p></details>
      </section>
      {permissions.canExport && <section aria-label="课程分析导出" className="training-analysis-export">
        <h3>导出当前分析数据</h3>
        <p>导出固定使用本次选择和分析清单，经现有导出队列生成；下载时再次核对权限与来源。</p>
        <div className="training-analysis-controls">
          <label>数据布局<select disabled={scientificLocked || busy} value={layout} onChange={event => setLayout(event.target.value as typeof layout)}><option value="long">长表</option><option value="wide">宽表</option><option value="dictionary">字段字典</option></select></label>
          <label>文件格式<select disabled={scientificLocked || busy} value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="csv">CSV</option><option value="zip">ZIP</option></select></label>
          <button type="button" disabled={scientificLocked || busy} onClick={() => void exportData()}>导出当前分析</button>
        </div>
      </section>}
      {permissions.canQuality && quality && <section aria-label="分析质量判断" className="training-analysis-quality">
        <h3>分析质量判断</h3><p>纳入或排除必须填写依据，并核对作答轮次、来源哈希与当前修订。此处不修改原始得分、提交状态或任务完成判定。</p>
        {quality.list.length === 0 ? <p>当前没有可管理的质量记录。</p> : quality.list.map(row => <QualityEditor key={`${row.attemptId}:${row.attemptEpoch}:${row.revision}`} row={row} disabled={scientificLocked || busy} onSave={(item, verdict, reason) => void saveQuality(item, verdict, reason)} />)}
        <div className="training-analysis-controls"><span>第 {quality.page} 页 · 共 {quality.total} 条</span>
          <button type="button" disabled={scientificLocked || busy || quality.page <= 1} onClick={() => void changeQualityPage(quality.page - 1)}>上一页质量记录</button>
          <button type="button" disabled={scientificLocked || busy || quality.page * quality.pageSize >= quality.total} onClick={() => void changeQualityPage(quality.page + 1)}>下一页质量记录</button>
        </div>
      </section>}
    </>}
  </section>
}
