import {selectionKey,record,validSelection,savedPending,type ReferenceSelection,type ReportSelection,type Kind,type Pending} from './trainingContentRecovery'
import { useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../../api/client'
import { usePageEditorGuard } from '../../components/shared-ui/usePageEditorGuard'

type Choice = { releaseId: string; entryKey: string; version: string; metricKey: string; referenceKind: string; scope: 'PRIVATE' | 'PLATFORM'; population: { description: string }; limitations: string[] }
type Unit = { itemId: string; family: string; measurementReleaseId: string; choices: Choice[]; reports: Array<{ releaseId: string; version: string; title: string | null; audience: string }> }
type Risk = { dirty: boolean; pending: boolean; busy: boolean }
type Detail = { id: string; revision: number; trainingReferenceSelectionDraft?: ReferenceSelection | null; trainingReportSelectionDraft?: ReportSelection | null; [key: string]: unknown }
type Props = { actorId: string; detail: Detail; disabled?: boolean; recoveryDisabled?: boolean; onSaved: (detail: Detail) => void; onRiskChange: (risk: Risk) => void }
// JSONB may reorder object keys, while selection array order remains exact. This is comparison, not a client authority hash.
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]))
  return value
}
const equal = (a: unknown, b: unknown) => JSON.stringify(ordered(a ?? null)) === JSON.stringify(ordered(b ?? null))
const field = (kind: Kind) => kind === 'reference' ? 'trainingReferenceSelectionDraft' : 'trainingReportSelectionDraft'
const emptyRisk: Risk = { dirty: false, pending: false, busy: false }
function validDetail(value: unknown, id: string): value is Detail {
  // These fields are omitted for actors without current ownership. Missing is not a verified clear.
  return record(value) && value.id === id && Number.isSafeInteger(value.revision) && value.revision >= 0
    && validSelection(value.trainingReferenceSelectionDraft, 'reference') && validSelection(value.trainingReportSelectionDraft, 'report')
}
function validUnits(value: unknown): value is { schemaVersion: 1; units: Unit[] } {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.units)) return false
  const ids = new Set<string>()
  return value.units.every((unit: unknown) => {
    if (!record(unit) || typeof unit.itemId !== 'string' || ids.has(unit.itemId) || typeof unit.family !== 'string' || typeof unit.measurementReleaseId !== 'string'
      || !Array.isArray(unit.choices) || !Array.isArray(unit.reports)) return false
    ids.add(unit.itemId)
    return unit.choices.every((choice: unknown) => record(choice) && ['releaseId', 'entryKey', 'version', 'metricKey', 'referenceKind'].every(key => typeof choice[key] === 'string')
      && ['PRIVATE', 'PLATFORM'].includes(choice.scope) && record(choice.population) && typeof choice.population.description === 'string'
      && Array.isArray(choice.limitations) && choice.limitations.every((text: unknown) => typeof text === 'string'))
      && unit.reports.every((report: unknown) => record(report) && ['releaseId', 'version', 'audience'].every(key => typeof report[key] === 'string') && (report.title === null || typeof report.title === 'string'))
  })
}
function Guard({ risk }: { risk: Risk }) {
  return usePageEditorGuard(null, { dirty: risk.dirty, busy: risk.pending || risk.busy }).confirmation
}
class RequestError extends Error {
  constructor(message: string, readonly knownRefusal = false) { super(message) }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await sessionFetch('/api/questionnaire-products/' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  let envelope: unknown
  try { envelope = await response.json() } catch { throw new RequestError('服务器结果尚未确认，请核对原请求。') }
  if (!record(envelope) || typeof envelope.code !== 'number') throw new RequestError('服务器结果尚未确认，请核对原请求。')
  if (!response.ok || envelope.code !== 0) throw new RequestError(typeof envelope.message === 'string' ? envelope.message : '操作未完成', [400, 401, 403, 404, 409, 422].includes(response.status))
  return envelope.data
}
/** Remount state and isolate late responses whenever the authenticated actor or product changes. */
export function TrainingContentSelection(props: Props) {
  return <SelectionWorkspace key={JSON.stringify([props.actorId, props.detail.id])} {...props} />
}
function SelectionWorkspace({ actorId, detail, disabled = false, recoveryDisabled = false, onSaved, onRiskChange }: Props) {
  const key = 'training-content-selection:' + JSON.stringify([actorId, detail.id])
  const [opened, setOpened] = useState(false), [units, setUnits] = useState<Unit[]>([])
  const [reference, setReference] = useState<ReferenceSelection | null>(detail.trainingReferenceSelectionDraft ?? null)
  const [report, setReport] = useState<ReportSelection | null>(detail.trainingReportSelectionDraft ?? null)
  const [pending, setPending] = useState<Pending | null>(() => savedPending(key, actorId, detail.id))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [retry, setRetry] = useState(false)
  const [superseded, setSuperseded] = useState<Detail | null>(null)
  const lock = useRef(false), epoch = useRef(0), baseline = useRef(detail), riskCallback = useRef(onRiskChange)
  riskCallback.current = onRiskChange
  const dirty = !equal(reference, detail.trainingReferenceSelectionDraft) || !equal(report, detail.trainingReportSelectionDraft)
  const risk = { dirty, pending: !!pending, busy }
  useEffect(() => { onRiskChange({ dirty, pending: !!pending, busy }) }, [dirty, pending, busy, onRiskChange])
  useEffect(() => () => { epoch.current++; riskCallback.current(emptyRisk) }, [])
  useEffect(() => {
    const previous = baseline.current
    baseline.current = detail
    setReference(value => equal(value, previous.trainingReferenceSelectionDraft) ? detail.trainingReferenceSelectionDraft ?? null : value)
    setReport(value => equal(value, previous.trainingReportSelectionDraft) ? detail.trainingReportSelectionDraft ?? null : value)
  }, [detail])
  const remember = (value: Pending | null) => {
    // Persist before sending. If storage is unavailable, no request is transmitted.
    if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key)
    setPending(value)
  }
  const execute = async (operation: (current: () => boolean) => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); onRiskChange({ ...risk, busy: true }); setError(''); setNotice('')
    const generation = epoch.current, current = () => epoch.current === generation
    try { await operation(current) } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '操作未完成') }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  const load = () => {
    if (disabled || pending) return
    void execute(async current => {
      const result = await request<unknown>(encodeURIComponent(detail.id) + '/content-reference-choices')
      if (!current()) return
      if (!validUnits(result)) throw new RequestError('可选版本响应不完整，请重新读取。')
      setUnits(result.units); setOpened(true)
    })
  }
  const adopt = (row: Detail, kind: Kind) => {
    if (kind === 'reference') setReference(row.trainingReferenceSelectionDraft ?? null); else setReport(row.trainingReportSelectionDraft ?? null)
    remember(null); setRetry(false); setSuperseded(null); onSaved(row)
  }
  const submit = (operation: Pending) => void execute(async current => {
    remember(operation); setRetry(false); setSuperseded(null)
    try {
      const row = await request<unknown>(encodeURIComponent(detail.id) + '/content-' + operation.kind + '-selection', { revision: operation.revision, selection: operation.selection })
      if (!current()) return
      if (!validDetail(row, detail.id) || row.revision <= operation.revision || !equal(row[field(operation.kind)], operation.selection)) throw new RequestError('保存响应与原请求不一致，请核对当前设置。')
      adopt(row, operation.kind); setNotice('选择已保存；正式发布时才冻结，不改变已有作答。')
    } catch (cause) {
      if (!current()) return
      if (cause instanceof RequestError && cause.knownRefusal && !operation.uncertain) remember(null)
      else remember({ ...operation, uncertain: true })
      throw cause
    }
  })
  const recover = () => {
    if (recoveryDisabled) return
    void execute(async current => {
    if (!pending) return
    setRetry(false); setSuperseded(null)
    const row = await request<unknown>(encodeURIComponent(detail.id))
    if (!current()) return
    if (!validDetail(row, detail.id) || row.revision < pending.revision) throw new RequestError('当前草稿身份、权限或选择信息不完整，尚不能确认原请求。')
    if (equal(row[field(pending.kind)], pending.selection)) { adopt(row, pending.kind); setNotice('已核对：服务器当前已保存相同选择。'); return }
    if (row.revision === pending.revision) { setRetry(true); setNotice('当前仍是原修订，可按原内容重试；尚未确认保存。') }
    else { setSuperseded(row); setNotice('服务器修订已变化，原请求不能再提交。可明确结束恢复并读取当前设置，不会自动覆盖或改用新修订。') }
    })
  }
  const endRecovery = () => {
    if (lock.current || recoveryDisabled || !pending || !superseded) return
    adopt(superseded, pending.kind)
    setNotice('已结束失效修订的恢复并读取当前设置；这不确认原请求成功。')
  }
  const reload = () => {
    if (disabled || pending) return
    void execute(async current => {
      const row = await request<unknown>(encodeURIComponent(detail.id))
      if (!current()) return
      if (!validDetail(row, detail.id)) throw new RequestError('当前草稿身份、权限或选择信息不完整。')
      setReference(row.trainingReferenceSelectionDraft ?? null); setReport(row.trainingReportSelectionDraft ?? null); onSaved(row)
      setOpened(false); setUnits([]); setNotice('已放弃本地选择修改并读取服务器当前设置。')
    })
  }
  const save = (kind: Kind) => {
    if (disabled || pending || !validDetail(detail, detail.id)) return
    submit({ actorId, compositeId: detail.id, kind, revision: detail.revision, selection: kind === 'reference' ? reference : report, uncertain: false })
  }
  const pickReport = (itemId: string, releaseId: string) => setReport(old => ({ schemaVersion: 1, units: [...(old?.units ?? []).filter(unit => unit.itemId !== itemId), ...(releaseId ? [{ itemId, reportReleaseId: releaseId }] : [])] }))
  const pickReference = (itemId: string, choice: Choice, selected: boolean, priority = 0) => setReference(old => {
    const previous = old?.units.find(unit => unit.itemId === itemId)?.choices ?? []
    const choices = previous.filter(value => selectionKey(value.releaseId, value.entryKey) !== selectionKey(choice.releaseId, choice.entryKey))
    if (selected) choices.push({ releaseId: choice.releaseId, entryKey: choice.entryKey, priority })
    return { schemaVersion: 1, units: [...(old?.units ?? []).filter(unit => unit.itemId !== itemId), { itemId, choices }] }
  })
  const unavailable = (report?.units ?? []).some(saved => !units.some(unit => unit.itemId === saved.itemId && unit.reports.some(choice => choice.releaseId === saved.reportReleaseId)))
    || (reference?.units ?? []).some(saved => saved.choices.some(choice => !units.some(unit => unit.itemId === saved.itemId && unit.choices.some(available => available.releaseId === choice.releaseId && available.entryKey === choice.entryKey))))
  return <section id="tool-references" aria-label="投放报告与参考选择" className="my-5 rounded border p-4 space-y-3">
    {(dirty || pending || busy) && <Guard risk={risk} />}<h2 className="text-xl font-semibold">投放报告与参考选择</h2>
    <p>只选择已发布且与当前测量版本兼容的内容。参考候选在投放发布时固定，开始测量时按冻结上下文匹配；缺少必要信息或匹配冲突时不输出比较。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && <div role="status"><p>上次保存结果尚未确认，保留原修订和选择，不会自动换成最新版本。</p>
      <button type="button" className="btn-secondary" disabled={busy || recoveryDisabled} onClick={recover}>核对原选择请求</button>
      <button type="button" className="btn-secondary" disabled={busy || recoveryDisabled || !retry} onClick={() => { if (!recoveryDisabled && retry && pending) submit(pending) }}>按原修订重试</button>
      {superseded && <><p>已核对服务器当前修订：{superseded.revision}；原修订：{pending.revision}。</p><button type="button" className="btn-secondary" disabled={busy || recoveryDisabled} onClick={endRecovery}>结束已失效选择恢复（不确认成功）</button></>}
    </div>}
    <button type="button" className="btn-secondary" disabled={disabled || busy || !!pending} onClick={load}>{opened ? '刷新可选内容' : '读取可选报告与参考'}</button>
    {error && !pending && <button type="button" className="btn-secondary" disabled={disabled || busy} onClick={reload}>放弃选择修改并读取当前设置</button>}
    {opened && <fieldset disabled={disabled || busy || !!pending} className="space-y-4"><legend className="sr-only">版本选择</legend>
      {units.map(unit => {
        const selectedReport = report?.units.find(value => value.itemId === unit.itemId)?.reportReleaseId ?? ''
        return <div key={unit.itemId} className="border-t pt-3"><h3>{unit.family} · {unit.itemId}</h3>
          <label>教师／研究者报告<select className="input block w-full" aria-label={'报告 ' + unit.itemId} value={selectedReport} onChange={event => pickReport(unit.itemId, event.target.value)}>
            <option value="">不选择新报告模板</option>{selectedReport && !unit.reports.some(value => value.releaseId === selectedReport) && <option value={selectedReport}>已保存但当前不可选：{selectedReport}</option>}
            {unit.reports.map(value => <option key={value.releaseId} value={value.releaseId}>{value.title || value.releaseId} · {value.version} · {value.audience}</option>)}
          </select></label>
          {!unit.choices.length && <p>此测量暂无获准参考，可保留描述性反馈。</p>}
          {unit.choices.map(choice => {
            const saved = reference?.units.find(value => value.itemId === unit.itemId)?.choices.find(value => selectionKey(value.releaseId, value.entryKey) === selectionKey(choice.releaseId, choice.entryKey))
            return <div key={selectionKey(choice.releaseId, choice.entryKey)} className="my-2"><label><input type="checkbox" checked={!!saved} onChange={event => pickReference(unit.itemId, choice, event.target.checked)} /> {choice.metricKey} · {choice.referenceKind} · {choice.version} · {choice.scope === 'PLATFORM' ? '平台正式' : '本测评私有'}</label>
              <p>适用范围：{choice.population.description}</p>{choice.limitations.length > 0 && <p>{choice.limitations.join('；')}</p>}
              <label>匹配优先级<input className="input" type="number" step="1" aria-label={'优先级 ' + unit.itemId + ' ' + choice.entryKey} disabled={!saved} value={saved?.priority ?? 0} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value)) pickReference(unit.itemId, choice, true, value) }} /></label>
            </div>
          })}
        </div>
      })}
      {!units.length && <p>暂无可绑定的测量，请先发布当前测量版本。</p>}
      {unavailable && <p role="status">部分已保存选择不在当前可选列表中，尚未删除。请核对版本与权限，或明确清空对应选择。</p>}
      <button type="button" className="btn-secondary" disabled={!dirty} onClick={() => { setReference(detail.trainingReferenceSelectionDraft ?? null); setReport(detail.trainingReportSelectionDraft ?? null) }}>放弃未保存的选择修改</button>
      <p>同一指标和参考类型的相同优先级若同时匹配，会明确标记冲突；不会随机套用常模。</p>
      <button type="button" className="btn-secondary" onClick={() => setReport(null)}>清空报告选择</button><button type="button" className="btn-primary" disabled={!validDetail(detail, detail.id) || equal(report, detail.trainingReportSelectionDraft)} onClick={() => save('report')}>保存报告选择</button>
      <button type="button" className="btn-secondary" onClick={() => setReference(null)}>清空参考选择</button><button type="button" className="btn-primary" disabled={!validDetail(detail, detail.id) || equal(reference, detail.trainingReferenceSelectionDraft)} onClick={() => save('reference')}>保存参考选择</button>
    </fieldset>}
  </section>
}
