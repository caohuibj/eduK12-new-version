import {useEffect, useRef, useState} from 'react'
import {adminContentApi, type StaticSjtMapping, type StaticSjtPublishRequest, type StaticSjtPublishResult, type StaticSjtSource} from '../api/adminContent'
import {contentUuid, isSjtMapping, isSjtPublishRequest, isSjtPublishResult, isSjtSource, requestFailure} from './contentRequestRecovery'

type Saved = {source: StaticSjtSource; mapping: StaticSjtMapping | null; preparePending: boolean; prepareUnknown: boolean;
  publish: StaticSjtPublishRequest | null; publishUnknown: boolean; result: StaticSjtPublishResult | null}
type GrantReceipt = {mappingId: string; grantId: string}
const key = (actorId: string) => 'admin-static-sjt:' + actorId
function restore(actorId: string): {state: Saved | null; error: string} {
  try {
    const raw = sessionStorage.getItem(key(actorId))
    if (!raw) return {state: null, error: ''}
    const saved = JSON.parse(raw)
    const state = saved.state
    if (saved.actorId !== actorId || !state || !isSjtSource(state.source)
      || typeof state.preparePending !== 'boolean' || typeof state.prepareUnknown !== 'boolean' || typeof state.publishUnknown !== 'boolean'
      || state.mapping !== null && (!isSjtMapping(state.mapping) || state.mapping.instrumentKey !== state.source.instrumentKey || state.mapping.instrumentVersion !== state.source.instrumentVersion)
      || state.publish !== null && (!isSjtPublishRequest(state.publish) || state.publish.mappingId !== state.mapping?.mappingId)
      || state.result !== null && (!isSjtPublishResult(state.result) || state.result.mappingId !== state.mapping?.mappingId)
      || state.preparePending && (state.mapping || state.publish || state.result) || state.publish && state.result)
      throw new Error('Invalid saved source')
    return {state, error: ''}
  } catch { return {state: null, error: '无法恢复当前管理员的 SJT 请求。请按此前精确来源和授权记录核对，不要重新编制发布。'} }
}
export default function AdminStaticSjtPublication({actorId, onPrepareGrant, grantReceipt, grantLocked}: {
  actorId: string; onPrepareGrant: (mappingId: string) => void; grantReceipt: GrantReceipt | null; grantLocked: boolean
}) {
  const [restored] = useState(() => restore(actorId))
  const [state, setState] = useState<Saved | null>(restored.state)
  const [storageError, setStorageError] = useState(restored.error)
  const [instrumentKey, setInstrumentKey] = useState(restored.state?.source.instrumentKey ?? '')
  const [version, setVersion] = useState(restored.state?.source.instrumentVersion ?? '')
  const [grantId, setGrantId] = useState(restored.state?.publish?.grantId ?? '')
  const [locale, setLocale] = useState(restored.state?.publish?.deployment.locale ?? '')
  const [territory, setTerritory] = useState(restored.state?.publish?.deployment.territory ?? '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false)
  const pending = state?.preparePending || Boolean(state?.publish)
  useEffect(() => {
    if (!pending) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [pending])
  function save(next: Saved) {
    setState(next)
    try { sessionStorage.setItem(key(actorId), JSON.stringify({actorId, state: next})); setStorageError('') }
    catch { setStorageError('浏览器无法保存 SJT 待核对请求。请勿离开或刷新；保留精确来源、映射、授权及部署字段后按原请求核对。') }
  }
  function reset() {
    if (pending || inFlight.current) return
    try {
      sessionStorage.removeItem(key(actorId)); setState(null); setStorageError(''); setError('')
      setInstrumentKey(''); setVersion(''); setGrantId(''); setLocale(''); setTerritory('')
    } catch { setStorageError('无法清理已核对的来源记录，请勿开始另一份发布。') }
  }
  async function prepare() {
    if (inFlight.current || restored.error) return
    const source = state?.source ?? {instrumentKey: instrumentKey.trim(), instrumentVersion: version.trim()}
    if (!isSjtSource(source)) { setError('请填写已安装 registry 的精确 instrumentKey 和 instrumentVersion，不使用名称、latest 或开发示例代替。'); return }
    const current: Saved = state ?? {source, mapping: null, preparePending: true, prepareUnknown: false, publish: null, publishUnknown: false, result: null}
    if (!window.confirm(`确认准备已安装来源 ${source.instrumentKey} / ${source.instrumentVersion}？此步骤只建立来源映射，不授予能力、来源许可或发布。`)) return
    inFlight.current = true; setBusy(true); setError('')
    // Persist conservatively before sending; an interrupted page cannot know whether the transaction committed.
    save({...current, preparePending: true, prepareUnknown: true})
    try {
      const response = await adminContentApi.prepareSjt(source)
      const mapping = response.data
      if (!isSjtMapping(mapping) || mapping.instrumentKey !== source.instrumentKey || mapping.instrumentVersion !== source.instrumentVersion)
        throw new Error('来源响应与精确请求不一致，结果尚未确认')
      save({...current, mapping, preparePending: false, prepareUnknown: false})
    } catch (failure) {
      const outcome = requestFailure(failure)
      const rejected = outcome.definiteRejection || (failure as {status?: number})?.status === 409
      if (!current.prepareUnknown && rejected) {
        try { sessionStorage.removeItem(key(actorId)); setState(null); setStorageError(''); setError(outcome.message + '；本次准备明确未执行，可修正来源后重试。') }
        catch { save({...current, preparePending: true}); setError(outcome.message + '；无法清理保存记录，请仍按原来源核对。') }
      } else {
        save({...current, preparePending: true, prepareUnknown: current.prepareUnknown || outcome.unknown})
        setError(outcome.message + '；来源已保留。请完成上方安全密钥验证后重试同一准备请求，不能视为失败或改用另一版本。')
      }
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function publish() {
    if (inFlight.current || !state?.mapping || state.preparePending || state.result || restored.error) return
    let request = state.publish
    if (!request) {
      if (!contentUuid.test(grantId.trim()) || !locale.trim() || !territory.trim()) {
        setError('请填写实际根授权 UUID、部署语言与科学适用地域。'); return
      }
      request = {mappingId: state.mapping.mappingId, grantId: grantId.trim(), deployment: {locale: locale.trim(), territory: territory.trim()}}
      if (!isSjtPublishRequest(request)) { setError('部署字段不能为空且各不超过 240 个字符。'); return }
    }
    if (!window.confirm(`确认发布来源 ${state.source.instrumentKey} / ${state.source.instrumentVersion}？映射 ${request.mappingId}，授权 ${request.grantId}，语言 ${request.deployment.locale}，地域 ${request.deployment.territory}。发布后部署字段不可更换；服务器仍需核验内容能力、精确来源与科学适用性。`)) return
    const current = state
    inFlight.current = true; setBusy(true); setError('')
    save({...current, publish: request, publishUnknown: true})
    try {
      const response = await adminContentApi.publishSjt(request)
      const result = response.data
      if (!isSjtPublishResult(result) || result.mappingId !== request.mappingId) throw new Error('发布响应与映射不一致，结果尚未确认')
      save({...current, mapping: {...current.mapping!, measurementReleaseId: result.measurementReleaseId}, publish: null, publishUnknown: false, result})
    } catch (failure) {
      const outcome = requestFailure(failure)
      const rejected = outcome.definiteRejection || (failure as {status?: number})?.status === 409
      if (!current.publishUnknown && rejected) {
        save({...current, publish: null, publishUnknown: false})
        setError(outcome.message + '；本次发布明确未执行。可核对内容能力与部署字段后重新提交，不能用管理员身份代替内容授权。')
      } else {
        save({...current, publish: request, publishUnknown: current.publishUnknown || outcome.unknown})
        setError(outcome.message + '；发布结果尚未确认，精确授权及部署字段已锁定。重新验证安全密钥后仅重试同一请求；后续拒绝不证明之前未成功。')
      }
    } finally { inFlight.current = false; setBusy(false) }
  }
  const mapping = state?.mapping
  return <section aria-labelledby="static-sjt-title">
    <h3 id="static-sjt-title">已安装 SJT 来源发布</h3>
    <p>沿用现有 registry 和评分器，不编辑题目或评分 key。流程：准备精确来源 → 显式签发 measurement.publish 根授权 → 核验精确部署与科学适用性并发布。管理员身份不自动拥有内容能力或科学审核权。</p>
    <p>所有请求均需上方近期安全密钥验证。版权许可不作为系统门禁；系统不判断是否已获许可。</p>
    <fieldset disabled={busy || Boolean(state) || Boolean(restored.error)}><legend>1. 精确 registry 来源</legend>
      <label>来源 instrumentKey<input value={instrumentKey} maxLength={240} onChange={event => setInstrumentKey(event.target.value)}/></label>
      <label>来源 instrumentVersion<input value={version} maxLength={240} onChange={event => setVersion(event.target.value)}/></label>
    </fieldset>
    {!mapping && <button className="btn-secondary" disabled={busy || Boolean(restored.error)} onClick={() => void prepare()}>{state?.preparePending ? '重试同一来源准备请求' : '准备精确 SJT 来源'}</button>}
    {state?.preparePending && <p>待核对来源：{state.source.instrumentKey} / {state.source.instrumentVersion}。保留原请求，不更换来源身份。</p>}
    {mapping && <>
      <p>已确认来源 {mapping.instrumentKey} / {mapping.instrumentVersion}；映射 UUID：{mapping.mappingId}；内容摘要：{mapping.contentDigest}。</p>
      {mapping.measurementReleaseId && !state.result && <p>来源已关联测量 release {mapping.measurementReleaseId}。这不代表本次部署已核验；仍须提交原部署字段核对。</p>}
      <h4>2. 独立内容根授权</h4>
      <p>固定范围：TRAINING / PLATFORM / situational-registry / measurement / {mapping.mappingId}；唯一能力 measurement.publish。目标为当前发布管理员 {actorId}，不允许从管理角色推定。</p>
      <button className="btn-secondary" disabled={busy || grantLocked || Boolean(state.publish) || Boolean(state.result)} onClick={() => onPrepareGrant(mapping.mappingId)}>将此来源填入根授权表单</button>
      {grantLocked && <p>请先处理根授权表单的待核对请求，或明确选择编制另一份授权。</p>}
      <h4>3. 精确部署与科学适用性</h4>
      <fieldset disabled={busy || Boolean(state.publish) || Boolean(state.result)}><legend>发布字段</legend>
        <label>SJT 发布授权 UUID<input value={grantId} onChange={event => setGrantId(event.target.value)}/></label>
        {grantReceipt?.mappingId === mapping.mappingId && <button className="btn-secondary" onClick={() => setGrantId(grantReceipt.grantId)}>使用刚签发的 SJT 授权</button>}
        <label>部署语言 locale<input value={locale} maxLength={240} onChange={event => setLocale(event.target.value)}/></label>
        <label>科学适用地域 territory<input value={territory} maxLength={240} onChange={event => setTerritory(event.target.value)}/></label>
      </fieldset>
      {state.publish && <p>待核对发布：映射 {state.publish.mappingId}；授权 {state.publish.grantId}；{state.publish.deployment.locale} / {state.publish.deployment.territory}。仅重试这份原请求。</p>}
      {!state.result && <button className="btn-primary" disabled={busy} onClick={() => void publish()}>{state.publish ? '重试同一 SJT 发布请求' : '确认发布 SJT 测量版本'}</button>}
      {state.result && <p role="status">发布已确认：测量 release {state.result.measurementReleaseId}；内容 hash {state.result.contentHash}；状态 {state.result.status}。后续使用仍由服务器核验当前授权。</p>}
      {!pending && <button className="btn-secondary" disabled={busy} onClick={reset}>准备另一精确来源</button>}
    </>}
    {storageError && <p role="alert">{storageError}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
