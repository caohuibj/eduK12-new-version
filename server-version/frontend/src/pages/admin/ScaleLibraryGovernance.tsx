import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SurveyBrand } from '../../survey/SurveyBrand'
import { productOrigins } from '../../products/origins'
import './survey-admin.css'
import { governanceApi, submissionStatusLabel, type GovernanceCatalogRecord, type GovernanceCapabilities, type GovernanceEntry, type GovernanceProduct, type GovernanceSubmission, type GovernanceUseGrant } from '../../api/scaleLibraryGovernance'
import { ScaleLibraryMediaPreview } from '../../components/scale-governance/ScaleLibraryMediaPreview'
import { ProductPage, PageHeader } from '../../components/product-ui'

const api = governanceApi('TRAINING')
const metadataLabels: Record<string, string> = { title: '名称', author: '作者 / 来源', copyright: '版权', applicability: '用途与适用范围', scoringDescription: '计分说明', reportDescription: '报告说明' }
const entryLabels = { ACTIVE: '已收录', WITHDRAWN: '已下架', EMERGENCY_DISABLED: '紧急停用' }
type Person = { id: string; username: string; name?: string; status?: string; isActive?: boolean }
const covers = (releaseIds: string[], releaseId: string) => releaseIds.includes(releaseId)
export default function ScaleLibraryGovernance() {
  const location=useLocation()
  const surveyContext=new URLSearchParams(location.search).get('workspace')==='survey'
  const origins=productOrigins()
  const [catalogPage, setCatalogPage] = useState(1), [catalogHasMore, setCatalogHasMore] = useState(false)
  const [catalog, setCatalog] = useState<GovernanceCatalogRecord[]>([]), [catalogDetail, setCatalogDetail] = useState<GovernanceCatalogRecord | null>(null), [catalogDetailLoading, setCatalogDetailLoading] = useState(false)
  const [capabilities, setCapabilities] = useState<GovernanceCapabilities | null>(null)
  const [submissions, setSubmissions] = useState<GovernanceSubmission[]>([]), [entries, setEntries] = useState<GovernanceEntry[]>([])
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [mediaReviewed, setMediaReviewed] = useState<Record<string, string>>({})
  const [details, setDetails] = useState<Record<string, Awaited<ReturnType<typeof api.submissionDetail>>>>({})
  const [detailLoading, setDetailLoading] = useState('')
  const [reason, setReason] = useState(''), [selected, setSelected] = useState<GovernanceEntry | null>(null)
  const [keyword, setKeyword] = useState(''), [peopleHasMore, setPeopleHasMore] = useState(false)
  const [grantLoaded, setGrantLoaded] = useState(false)
  const [grants, setGrants] = useState<GovernanceUseGrant[]>([]), [people, setPeople] = useState<Person[]>([]), [userId, setUserId] = useState(''), [product, setProduct] = useState<GovernanceProduct>('TRAINING'), [peoplePage, setPeoplePage] = useState(1)
  const catalogReadGeneration = useRef(0), catalogDetailGeneration = useRef(0)
  const pendingGrant = useRef<{ key: string; requestId: string } | null>(null)
  const mounted = useRef(true), locked = useRef(false), lookupGeneration = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++catalogReadGeneration.current
    setLoading(true); setError('')
    try {
      const authority = await api.capabilities()
      if (!mounted.current || current !== catalogReadGeneration.current) return
      setCapabilities(authority)
      const [applications, library] = await Promise.all([api.submissions(), api.catalog(catalogPage)])
      if (!mounted.current || current !== catalogReadGeneration.current) return
      setSubmissions(applications.list); setCatalog(library.list); setCatalogHasMore(library.hasMore); const authored = library.list.flatMap(row => row.authored ? [row.authored] : []); setEntries(authored)
      setSelected(current => current ? authored.find(row => row.id === current.id) || null : null)
    } catch (failure) { if (mounted.current && current === catalogReadGeneration.current) { setCapabilities(null); setError(failure instanceof Error ? failure.message : '治理状态加载失败') } }
    finally { if (mounted.current && current === catalogReadGeneration.current) setLoading(false) }
  }, [catalogPage])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; lookupGeneration.current++; catalogReadGeneration.current++; catalogDetailGeneration.current++ } }, [refresh])
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try { await work(); if (mounted.current) { setNotice(message); setReason(''); await refresh() } }
    catch (failure) { if (mounted.current) setError((failure instanceof Error ? failure.message : '操作失败') + '。未自动重试，请刷新核对当前状态。') }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const inspect = async (row: GovernanceSubmission) => {
    setDetailLoading(row.id); setError('')
    try { const detail = await api.submissionDetail(row.id); if (mounted.current) setDetails(current => ({ ...current, [row.id]: detail })) }
    catch (failure) { if (mounted.current) { setDetails(current => { const next = { ...current }; delete next[row.id]; return next }); setError(failure instanceof Error ? failure.message : '精确版本审核内容读取失败') } }
    finally { if (mounted.current) setDetailLoading('') }
  }
  const reviewGrant = (releaseId: string) => capabilities?.reviewGrants.find(grant => covers(grant.releaseIds, releaseId))?.grantId
  const canReview = (releaseId: string) => Boolean(capabilities?.systemAdmin || reviewGrant(releaseId))
  const distributionGrant = (releaseId: string, target: GovernanceProduct) => capabilities?.distributionGrants.find(grant => grant.product === target && covers(grant.releaseIds, releaseId))?.grantId
  const canDistribute = (row: GovernanceEntry, target: GovernanceProduct) => Boolean(row.supportedEntrypoints?.includes(target) && (capabilities?.systemAdmin || distributionGrant(row.releaseId, target)))
  const loadGrants = async (entry: GovernanceEntry) => {
    const current = ++lookupGeneration.current
    setSelected(entry); setProduct(entry.supportedEntrypoints?.[0] || 'TRAINING'); setKeyword(''); setGrants([]); setGrantLoaded(false); setUserId(''); setPeople([])
    try { const response = await api.grants(entry.id); if (mounted.current && current === lookupGeneration.current) { setGrants(response.list); setGrantLoaded(true) } }
    catch (failure) { if (mounted.current && current === lookupGeneration.current) setError(failure instanceof Error ? failure.message : '授权状态加载失败') }
  }
  const loadPeople = async (page = 1) => {
    if (!selected || !canDistribute(selected, product)) return
    const current = ++lookupGeneration.current
    setUserId(''); setPeople([]); setError('')
    try {
      const response = await api.recipients(selected.id, product, page, keyword.trim(), distributionGrant(selected.releaseId, product))
      if (mounted.current && current === lookupGeneration.current) { setPeople(response.list); setPeoplePage(response.page); setPeopleHasMore(response.hasMore) }
    } catch (failure) { if (mounted.current && current === lookupGeneration.current) setError(failure instanceof Error ? failure.message : '授权对象读取失败') }
  }
  const inspectCatalog = async (row: GovernanceCatalogRecord) => {
    const current = ++catalogDetailGeneration.current
    setCatalogDetail(null); setCatalogDetailLoading(true); setError('')
    try { const response = await api.catalogDetail(row); if (mounted.current && current === catalogDetailGeneration.current) setCatalogDetail(response.entry) }
    catch (failure) { if (mounted.current && current === catalogDetailGeneration.current) setError(failure instanceof Error ? failure.message : '精确目录详情读取失败') }
    finally { if (mounted.current && current === catalogDetailGeneration.current) setCatalogDetailLoading(false) }
  }
  const assign = async () => {
    if (!selected || !userId || !canDistribute(selected, product)) return
    const key = JSON.stringify([selected.id, userId, product])
    if (pendingGrant.current?.key !== key) pendingGrant.current = { key, requestId: crypto.randomUUID() }
    await api.grant(selected.id, userId, product, pendingGrant.current.requestId, distributionGrant(selected.releaseId, product))
    pendingGrant.current = null
    const response = await api.grants(selected.id); if (mounted.current) setGrants(response.list)
  }
  return <ProductPage><div className={surveyContext?'survey-admin survey-admin-governance':undefined}>
    {surveyContext&&origins&&<header className="survey-admin-header"><div><SurveyBrand href={origins.survey+'/'}/><p className="survey-admin-kicker">HUISURVEY · 公库与审批</p></div>
      <Link className="survey-admin-return" to="/admin/survey-researchers">返回研究者与工具授权</Link></header>}
    <PageHeader title="公共量表库与授权治理" description="统一汇总标准量表与获批自编量表；精确版本、科学身份和授权规则分别保留。" />
    <section className="staff-panel staff-panel--padded p-5 space-y-2"><h2>两类权限分别管理</h2><p>系统级审核与明确范围的审核委托，负责是否收录；入口分配权限只负责已批准版本的使用授权，不能代替入库审核。</p><p>批准入库不等于全平台可用，不构成标准科学量表认证。使用授权仅可使用原版，不授予修改、改编或转授权权限。</p>{capabilities?.systemAdmin && <Link to="/admin/permissions">查看系统权限与委托范围</Link>}<p>本页按后端实时能力提供操作；入口管理员身份本身不授予审核权。</p></section>
    {loading && <p role="status">正在核对治理权限…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" className="hui-button hui-button--secondary" disabled={busy || loading} onClick={() => void refresh()}>刷新状态</button>
    {capabilities && <><section className="staff-panel staff-panel--padded p-5 mt-4"><h2>入库申请</h2><label>审核、下架或撤权说明<textarea className="input block w-full" value={reason} onChange={event => setReason(event.target.value)} disabled={busy}/></label>
      {submissions.map(row => <article key={row.id} className="border rounded p-4 mt-3"><h3>{row.metadata.title} · {submissionStatusLabel[row.status]}</h3><p className="break-all">{row.product} · 精确版本 {row.releaseId}</p><dl>{Object.entries(row.metadata).map(([key, value]) => <div key={key}><dt>{metadataLabels[key] || key}</dt><dd>{value}</dd></div>)}</dl>{row.reason && <p>处理说明：{row.reason}</p>}{canReview(row.releaseId) && <div className="my-3"><button type="button" className="hui-button hui-button--secondary" disabled={busy || !!detailLoading} onClick={() => void inspect(row)}>读取精确版本审核内容</button>{details[row.id] && <details open><summary>冻结内容、计分、报告与依赖版本</summary><pre tabIndex={0} role="region" aria-label={`审核冻结内容：${row.metadata.title} · ${row.releaseId}`} className="whitespace-pre-wrap break-all text-xs max-h-96 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">{JSON.stringify(details[row.id], null, 2)}</pre></details>}{details[row.id]?.mediaManifest && <section aria-label="固定附件审核清单"><h4>同批媒体审核</h4><p>批准后将固定附件纳入受控平台媒体库；不是匿名公开 URL。退回不发布媒体。</p>{details[row.id].mediaManifest.items.map(item => <article key={item.assetId + item.assetVersion}><p className="break-all">{item.assetId} · {item.mimeType} · {item.sizeBytes} 字节 · v{item.assetVersion} · {item.contentHash}</p><p>用途：{item.usages.join('、')}；权限：仅随此批准量表供获授权使用者 / 对应任务使用，不允许脱离量表独立复用。</p><ScaleLibraryMediaPreview product="TRAINING" context={{ kind: 'submissions', id: row.id }} item={item}/></article>)}{details[row.id].mediaManifest.items.length > 0 && <label><input type="checkbox" checked={mediaReviewed[row.id] === details[row.id].mediaManifest.manifestHash} onChange={event => setMediaReviewed(current => ({ ...current, [row.id]: event.target.checked ? details[row.id].mediaManifest.manifestHash : '' }))}/>已核对固定附件内容及随量表共享权限</label>}</section>}<p>批准前请核对实际冻结题目、计分、报告及依赖；仅有申请说明不足以批准。</p></div>}{row.status === 'SUBMITTED' && canReview(row.releaseId) && <div className="flex gap-2 mt-3"><button type="button" className="hui-button hui-button--primary" disabled={busy || loading || !reason.trim() || details[row.id]?.version !== row.version || details[row.id]?.releaseId !== row.releaseId || !details[row.id]?.mediaManifest || (details[row.id].mediaManifest.items.length > 0 && mediaReviewed[row.id] !== details[row.id].mediaManifest.manifestHash)} onClick={() => void run(() => api.review(row, 'APPROVE', reason.trim(), reviewGrant(row.releaseId)), '已批准收录，尚未自动分配使用权限。')}>批准精确版本入库</button><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || !reason.trim()} onClick={() => void run(() => api.review(row, 'RETURN', reason.trim(), reviewGrant(row.releaseId)), '申请已退回，作者可查看原因。')}>退回并说明原因</button></div>}</article>)}
      {!submissions.length && !loading && <p>当前范围没有入库申请。</p>}
    </section><section className="staff-panel staff-panel--padded p-5 mt-4"><h2>公共量表总汇</h2><p>标准量表与获批自编量表在同一目录分页呈现。目录可见或版权获批，不代表当前用户已获入口使用权限；来源入口仅表示出处，不决定使用授权。</p><p>普通下架或撤权停止新增使用，保留历史与既有绑定；紧急停用会阻止该版本继续用于运行，可能影响正在进行的任务或波次。历史答卷与报告不删除。</p>
      {catalog.filter(row => row.origin === 'STANDARD_REGISTRY').map(row => <article key={row.catalogId} className="border rounded p-4 mt-3"><h3>{row.title} · 标准量表（只读）</h3><p>{row.exactVersion.instrumentKey} · v{row.exactVersion.instrumentVersion}</p><p>{row.standard?.construct.constructDefinition}</p><p>版权状态：{row.standard?.rights.status || '待核对'}；科学证据：{row.standard?.evidence.coverageText || '查看精确详情'}。</p><p>目录状态：{row.availability.status === 'NOT_AVAILABLE' ? '暂不可用' : '使用前需核验入口授权'}；不会自动转为自编量表或绕过原标准授权。</p><button type="button" className="hui-button hui-button--secondary" disabled={catalogDetailLoading} onClick={() => void inspectCatalog(row)}>查看标准精确版本详情</button><Link className="ml-3" to="/admin/instrument-authorizations">原标准版权与使用授权管理</Link></article>)}
      {entries.map(row => <article key={row.id} className="border rounded p-4 mt-3"><h3>{row.metadata.title} · 自编描述性量表 · {entryLabels[row.status]}</h3><p className="break-all">精确版本 {row.releaseId}</p><p>兼容入口：{row.supportedEntrypoints?.join('、') || '暂无可分配入口'}</p><div className="flex flex-wrap gap-2"><button type="button" className="hui-button hui-button--secondary" disabled={catalogDetailLoading} onClick={() => { const record = catalog.find(item => item.authored?.id === row.id); if (record) void inspectCatalog(record) }}>查看自编精确版本详情</button><button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={() => void loadGrants(row)}>查看 / 分配只读使用权限</button>{row.status !== 'EMERGENCY_DISABLED' && canReview(row.releaseId) && <><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || row.status !== 'ACTIVE' || !reason.trim()} onClick={() => void run(() => api.setStatus(row, 'WITHDRAWN', reason.trim(), reviewGrant(row.releaseId)), '已普通下架；历史记录保留。')}>普通下架</button><button type="button" className="hui-button hui-button--secondary text-red-700" disabled={busy || loading || !reason.trim()} onClick={() => { if (window.confirm('紧急停用将阻止此精确版本继续用于运行，可能影响正在进行的任务或波次；历史数据不会删除。确认紧急停用？\n原因：' + reason.trim())) void run(() => api.setStatus(row, 'EMERGENCY_DISABLED', reason.trim(), reviewGrant(row.releaseId)), '已紧急停用；历史数据保留。') }}>紧急停用（影响运行）</button></>}</div></article>)}
      {!catalog.length && !loading && <p>本页没有可见量表。</p>}<div className="flex gap-3 items-center mt-4" aria-label="公共量表目录分页"><button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || catalogPage <= 1} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page - 1) }}>目录上一页</button><span>目录第 {catalogPage} 页</span><button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || !catalogHasMore} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page + 1) }}>目录下一页</button></div>
      {catalogDetailLoading && <p role="status">正在读取精确目录详情…</p>}{catalogDetail && <section aria-label="公共量表精确版本详情" className="border rounded p-4 mt-3"><h3>{catalogDetail.title} · {catalogDetail.origin === 'STANDARD_REGISTRY' ? '标准科学身份保留 · 只读' : '自编描述性量表 · 精确获批版本'}</h3><p>目录与许可状态不替代目标入口的实际使用授权。以下是服务器按精确版本返回的详情。</p><pre tabIndex={0} role="region" aria-label={`目录版本内容：${catalogDetail.title}`} className="whitespace-pre-wrap break-all text-xs max-h-96 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">{JSON.stringify(catalogDetail, null, 2)}</pre></section>}
    </section>{selected && <section className="staff-panel staff-panel--padded p-5 mt-4" aria-label="精确版本使用授权"><h2>{selected.metadata.title} · 只读使用授权</h2><p className="break-all">版本 {selected.releaseId}。授权不包含改编；旧问卷不会自动升级。</p>{!grantLoaded && <p role="status">尚未确认现有授权，请重新读取该版本授权后再分配。</p>}<fieldset disabled={busy || loading || !grantLoaded || selected.status !== 'ACTIVE'}><label>目标入口<select className="input block" value={product} onChange={event => { lookupGeneration.current++; setProduct(event.target.value as GovernanceProduct); setPeople([]); setUserId('') }}><option value="TRAINING" disabled={!selected.supportedEntrypoints?.includes('TRAINING')}>Training</option><option value="SURVEY" disabled={!selected.supportedEntrypoints?.includes('SURVEY')}>Survey</option></select></label>{(['TRAINING', 'SURVEY'] as const).filter(target => !selected.supportedEntrypoints?.includes(target)).map(target => <p key={target}>{target}：{selected.compatibilityReasons?.[target] || '当前版本不支持此入口，不能分配使用。'}</p>)}{canDistribute(selected, product) ? <><label>查找授权账号<input className="input block" value={keyword} onChange={event => setKeyword(event.target.value)}/></label><button type="button" className="hui-button hui-button--secondary" onClick={() => void loadPeople(1)}>读取可见授权对象</button><label>授权对象<select className="input block" value={userId} onChange={event => setUserId(event.target.value)}><option value="">请选择已核对的账号</option>{people.map(person => <option key={person.id} value={person.id}>{person.name || person.username} · {person.username} · {person.id}</option>)}</select></label>{people.length > 0 && <div><button type="button" disabled={peoplePage <= 1} onClick={() => void loadPeople(peoplePage - 1)}>对象上一页</button><button type="button" disabled={!peopleHasMore} onClick={() => void loadPeople(peoplePage + 1)}>对象下一页</button></div>}<button type="button" className="hui-button hui-button--primary" disabled={!userId} onClick={() => void run(assign, '已分配精确版本的只读使用授权。')}>授予所选账号只读使用</button></> : <p>当前账号没有此版本在该入口的分配权限。</p>}</fieldset>
      {grants.map(grant => <article key={grant.id} className="border rounded p-3 mt-2"><p>{grant.product} · {grant.userId} · {grant.status}</p>{canDistribute(selected, grant.product) && grant.status === 'ACTIVE' && <button type="button" className="hui-button hui-button--secondary" disabled={busy || !reason.trim()} onClick={() => void run(async () => { await api.revoke(grant, reason.trim()); const response = await api.grants(selected.id); if (mounted.current) setGrants(response.list) }, '授权已撤销；历史记录保留。')}>撤销新增使用权限</button>}</article>)}
    </section>}</>}
  </div></ProductPage>
}
