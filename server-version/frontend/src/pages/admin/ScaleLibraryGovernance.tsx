import CatalogDiscoveryFilters from '../../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../../components/scale-governance/CatalogClassificationTags'
import {EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogFilters,type CatalogTagFacets} from '../../api/catalogDiscovery'
import { scaleRightsStatusLabel } from '../../modules/scale/rightsPresentation'
import { EducationLibraryDistributionPicker, educationDistributionReason } from '../../components/scale-governance/EducationLibraryDistributionPicker'
import {EducationApplicabilitySummary} from '../../components/scale-governance/EducationApplicabilityFields'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './survey-admin.css'
import './survey-library.css'
import { ChevronDown, BookOpen, ClipboardList, FileSearch, RefreshCw, ShieldCheck } from 'lucide-react'
import { governanceApi, submissionStatusLabel, type GovernanceCatalogRecord, type GovernanceCapabilities, type GovernanceEntry, type GovernanceTargetProduct, type EducationDistributionProduct, type GovernanceSubmission, type GovernanceUseGrant } from '../../api/scaleLibraryGovernance'
import { ScaleLibraryMediaPreview } from '../../components/scale-governance/ScaleLibraryMediaPreview'
import { ProductPage, PageHeader } from '../../components/product-ui'

const api = governanceApi('TRAINING')
const metadataLabels: Record<string, string> = { title: '名称', author: '作者 / 来源', copyright: '版权', applicability: '用途与适用范围', scoringDescription: '计分说明', reportDescription: '报告说明' }
const entryLabels = { ACTIVE: '已收录', WITHDRAWN: '已下架', EMERGENCY_DISABLED: '紧急停用' }
type Person = { id: string; username: string; name?: string; status?: string; isActive?: boolean }
const isEducationTarget=(product:GovernanceTargetProduct):product is EducationDistributionProduct=>product==='SCHOOL'||product==='TEACHER'
const targetReady=(entry:GovernanceEntry,target:GovernanceTargetProduct)=>{
  if(!entry.supportedEntrypoints?.includes(target))return false
  if(!isEducationTarget(target))return true
  const readiness=entry.educationDistribution?.products?.[target]
  return Boolean(readiness?.status==='READY'&&readiness.canDistribute&&readiness.contentCompatible&&entry.contentHash)
}
const targetLabels={TRAINING:'Training',SURVEY:'Survey',SCHOOL:'School',TEACHER:'Teacher'}
const covers = (releaseIds: string[], releaseId: string) => releaseIds.includes(releaseId)
/** Presentation only: non-Survey management keeps its existing DOM and actions. */
function SurveyLibraryDisclosure({ enabled, label, children }: { enabled: boolean; label: string; children: ReactNode }) {
  if (!enabled) return <>{children}</>
  return <details className="slg-action-disclosure"><summary>{label}<ChevronDown size={17} aria-hidden="true"/></summary><div className="slg-disclosure-content">{children}</div></details>
}
import SurveyLibraryAdmin from './SurveyLibraryAdmin'
import StandardTripletWorkspace from './StandardTripletWorkspace'
import {useAuth} from '../../contexts/AuthContext'
export default function ScaleLibraryGovernance(){const location=useLocation(),{user}=useAuth();return new URLSearchParams(location.search).get('workspace')==='survey'?<SurveyLibraryAdmin/>:user?.platformRole==='SYSTEM_ADMIN'?<StandardTripletWorkspace authored={<LegacyScaleLibraryGovernance authoredOnly/>}/>:<LegacyScaleLibraryGovernance/>}
export function LegacyScaleLibraryGovernance({authoredOnly=false}:{authoredOnly?:boolean}={}) {
  const {user}=useAuth()
  const systemContext=user?.platformRole==='SYSTEM_ADMIN'
  const [view, setView] = useState<'catalog' | 'submissions'>(authoredOnly?'submissions':'catalog')
  const [filters,setFilters]=useState<CatalogFilters>({...EMPTY_CATALOG_FILTERS,origin:authoredOnly?'AUTHORED':'ALL'}),[appliedFilters,setAppliedFilters]=useState<CatalogFilters>({...EMPTY_CATALOG_FILTERS,origin:authoredOnly?'AUTHORED':'ALL'}),[tagFacets,setTagFacets]=useState<CatalogTagFacets>(EMPTY_CATALOG_FACETS)
  const location=useLocation()
  const surveyContext=new URLSearchParams(location.search).get('workspace')==='survey'
  const modernContext=surveyContext||systemContext
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
  const [grants, setGrants] = useState<GovernanceUseGrant[]>([]), [people, setPeople] = useState<Person[]>([]), [userId, setUserId] = useState(''), [product, setProduct] = useState<GovernanceTargetProduct>(surveyContext?'SURVEY':'TRAINING'), [peoplePage, setPeoplePage] = useState(1)
  const detailRegion = useRef<HTMLElement>(null), grantRegion = useRef<HTMLElement>(null)
  useEffect(() => { if (modernContext && catalogDetail) { detailRegion.current?.focus({ preventScroll: true }); detailRegion.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) } }, [modernContext, catalogDetail])
  useEffect(() => { if (modernContext && selected?.id) { grantRegion.current?.focus({ preventScroll: true }); grantRegion.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) } }, [modernContext, selected?.id])
  const catalogReadGeneration = useRef(0), catalogDetailGeneration = useRef(0)
  const pendingGrant = useRef<{ key: string; requestId: string } | null>(null)
  const mounted = useRef(true), locked = useRef(false), lookupGeneration = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++catalogReadGeneration.current
    setLoading(true); setError('');setCatalog([]);setCatalogHasMore(false)
    try {
      const authority = await api.capabilities()
      if (!mounted.current || current !== catalogReadGeneration.current) return
      setCapabilities(authority)
      const [applications, library] = await Promise.all([api.submissions(), Object.values(appliedFilters).some(value=>value&&value!=='ALL')?api.catalog(catalogPage,25,appliedFilters):api.catalog(catalogPage)])
      if (!mounted.current || current !== catalogReadGeneration.current) return
      setSubmissions(applications.list); setCatalog(library.list); setCatalogHasMore(library.hasMore);setTagFacets(library.tagFacets??EMPTY_CATALOG_FACETS); const authored = library.list.flatMap(row => row.authored ? [row.authored] : []); setEntries(authored)
      setSelected(current => current ? authored.find(row => row.id === current.id) || null : null)
    } catch (failure) { if (mounted.current && current === catalogReadGeneration.current) { setCapabilities(null);setCatalog([]);setCatalogHasMore(false);setSelected(null);setCatalogDetail(null); setError(failure instanceof Error ? failure.message : '治理状态加载失败') } }
    finally { if (mounted.current && current === catalogReadGeneration.current) setLoading(false) }
  }, [catalogPage,appliedFilters])
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
  const distributionGrant = (releaseId: string, target: GovernanceTargetProduct) => capabilities?.distributionGrants.find(grant => grant.product === target && covers(grant.releaseIds, releaseId))?.grantId
  const canDistribute = (row: GovernanceEntry, target: GovernanceTargetProduct) => Boolean(!(target==='SURVEY'&&capabilities?.systemAdmin) && targetReady(row,target) && ((isEducationTarget(target)&&capabilities?.systemAdmin) || distributionGrant(row.releaseId, target)))
  const loadGrants = async (entry: GovernanceEntry) => {
    const current = ++lookupGeneration.current
    setSelected(entry); setProduct(surveyContext?'SURVEY':entry.supportedEntrypoints?.[0] || 'TRAINING'); setKeyword(''); setGrants([]); setGrantLoaded(false); setUserId(''); setPeople([])
    try { const response = await api.grants(entry.id); if (mounted.current && current === lookupGeneration.current) { setGrants(response.list); setGrantLoaded(true) } }
    catch (failure) { if (mounted.current && current === lookupGeneration.current) setError(failure instanceof Error ? failure.message : '授权状态加载失败') }
  }
  const loadPeople = async (page = 1) => {
    if (!selected || isEducationTarget(product) || !canDistribute(selected, product)) return
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
    if (!selected || !userId || isEducationTarget(product) || !canDistribute(selected, product)) return
    const key = JSON.stringify([selected.id, userId, product])
    if (pendingGrant.current?.key !== key) pendingGrant.current = { key, requestId: crypto.randomUUID() }
    await api.grant(selected.id, userId, product, pendingGrant.current.requestId, distributionGrant(selected.releaseId, product))
    pendingGrant.current = null
    const response = await api.grants(selected.id); if (mounted.current) setGrants(response.list)
  }
  const permissionNotes=<><p>审核负责是否入库；使用授权负责哪些账号可用，两者分别核对。</p><p>入库不代表所有研究者均可使用，也不改变标准量表的科学身份、版权或改编限制。</p>{capabilities?.systemAdmin&&<Link to="/admin/permissions">平台审核权限设置</Link>}<p>操作按后台返回的精确版本与实际权限提供。</p></>
  // Construct only the visible workspace; retain loaded state across tabs.
  const applicationPanel = (!modernContext || view === 'submissions') && <section className="staff-panel staff-panel--padded p-5 mt-4 slg-submissions"><h2>入库申请</h2>{!modernContext && <label>审核、下架或撤权说明<textarea className="input block w-full" value={reason} onChange={event => setReason(event.target.value)} disabled={busy}/></label>}
      {submissions.map(row => <article key={row.id} className="border rounded p-4 mt-3"><h3>{row.metadata.title} · {submissionStatusLabel[row.status]}</h3><SurveyLibraryDisclosure enabled={modernContext} label="申请详情与审核"><p className="break-all">{row.product} · 精确版本 {row.releaseId}</p><dl>{Object.entries(row.metadata).map(([key, value]) => <div key={key}><dt>{metadataLabels[key] || key}</dt><dd>{value}</dd></div>)}</dl>{row.reason && <p>处理说明：{row.reason}</p>}{canReview(row.releaseId) && <div className="my-3"><button type="button" className="hui-button hui-button--secondary" disabled={busy || !!detailLoading} onClick={() => void inspect(row)}>读取精确版本审核内容</button>{details[row.id] && <details open><summary>冻结内容、计分、报告与依赖版本</summary><pre tabIndex={0} role="region" aria-label={`审核冻结内容：${row.metadata.title} · ${row.releaseId}`} className="whitespace-pre-wrap break-all text-xs max-h-96 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">{JSON.stringify(details[row.id], null, 2)}</pre></details>}{details[row.id]?.version===row.version && details[row.id]?.releaseId===row.releaseId && <EducationApplicabilitySummary value={details[row.id].educationApplicability} hash={details[row.id].educationApplicabilityHash}/>}{details[row.id]?.mediaManifest && <section aria-label="固定附件审核清单"><h4>同批媒体审核</h4><p>批准后将固定附件纳入受控平台媒体库；不是匿名公开 URL。退回不发布媒体。</p>{details[row.id].mediaManifest.items.map(item => <article key={item.assetId + item.assetVersion}><p className="break-all">{item.assetId} · {item.mimeType} · {item.sizeBytes} 字节 · v{item.assetVersion} · {item.contentHash}</p><p>用途：{item.usages.join('、')}；权限：仅随此批准量表供获授权使用者 / 对应任务使用，不允许脱离量表独立复用。</p><ScaleLibraryMediaPreview product="TRAINING" context={{ kind: 'submissions', id: row.id }} item={item}/></article>)}{details[row.id].mediaManifest.items.length > 0 && <label><input type="checkbox" checked={mediaReviewed[row.id] === details[row.id].mediaManifest.manifestHash} onChange={event => setMediaReviewed(current => ({ ...current, [row.id]: event.target.checked ? details[row.id].mediaManifest.manifestHash : '' }))}/>已核对固定附件内容及随量表共享权限</label>}</section>}<p>批准前请核对实际冻结题目、计分、报告及依赖；仅有申请说明不足以批准。</p></div>}{row.status === 'SUBMITTED' && canReview(row.releaseId) && <div className="flex gap-2 mt-3"><button type="button" className="hui-button hui-button--primary" disabled={busy || loading || !reason.trim() || details[row.id]?.version !== row.version || details[row.id]?.releaseId !== row.releaseId || !details[row.id]?.mediaManifest || (details[row.id].mediaManifest.items.length > 0 && mediaReviewed[row.id] !== details[row.id].mediaManifest.manifestHash)} onClick={() => void run(() => api.review(row, 'APPROVE', reason.trim(), reviewGrant(row.releaseId)), '已批准收录，尚未自动分配使用权限。')}>批准精确版本入库</button><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || !reason.trim()} onClick={() => void run(() => api.review(row, 'RETURN', reason.trim(), reviewGrant(row.releaseId)), '申请已退回，作者可查看原因。')}>退回并说明原因</button></div>}</SurveyLibraryDisclosure></article>)}
      {!submissions.length && !loading && <p>当前范围没有入库申请。</p>}
    </section>
  const applyCatalogFilters=(next:CatalogFilters)=>{catalogReadGeneration.current++;catalogDetailGeneration.current++;setCatalogDetail(null);setSelected(null);setCatalogPage(1);setAppliedFilters({...next,origin:authoredOnly?'AUTHORED':next.origin,keyword:next.keyword.trim()})}
  const catalogDiscoveryControls=<CatalogDiscoveryFilters label="公共量表总汇检索" filters={filters} facets={tagFacets} onChange={setFilters} onApply={applyCatalogFilters} includeOrigin={!authoredOnly} disabled={busy}/>
  const legacyCatalog = !surveyContext && <section className="staff-panel staff-panel--padded p-5 mt-4"><h2>公共量表总汇</h2>{catalogDiscoveryControls}<p>标准量表与获批自编量表在同一目录分页呈现。目录可见或版权获批，不代表当前用户已获入口使用权限；来源入口仅表示出处，不决定使用授权。</p><p>普通下架或撤权停止新增使用，保留历史与既有绑定；紧急停用会阻止该版本继续用于运行，可能影响正在进行的任务或波次。历史答卷与报告不删除。</p>
      {catalog.filter(row => row.origin === 'STANDARD_REGISTRY').map(row => <article key={row.catalogId} className="border rounded p-4 mt-3"><h3>{row.title} · 标准量表（只读）</h3><CatalogClassificationTags tags={row.classificationTags}/><p>{row.exactVersion.instrumentKey} · v{row.exactVersion.instrumentVersion}</p><p>{row.standard?.construct.constructDefinition}</p><p>版权状态：{scaleRightsStatusLabel(row.standard?.rights.status || '待核对')}；科学证据：{row.standard?.evidence.coverageText || '查看精确详情'}。</p><p>目录状态：{row.availability.status === 'NOT_AVAILABLE' ? '暂不可用' : '使用前需核验入口授权'}；不会自动转为自编量表或绕过原标准授权。</p><button type="button" className="hui-button hui-button--secondary" disabled={catalogDetailLoading} onClick={() => void inspectCatalog(row)}>查看标准精确版本详情</button>{!surveyContext&&row.authorization.mechanism!=='SELF_AUTHORED_SOURCE'&&<Link className="ml-3" to="/admin/instrument-authorizations">原标准版权与使用授权管理</Link>}</article>)}
      {entries.map(row => <article key={row.id} className="border rounded p-4 mt-3"><h3>{row.metadata.title} · 自编描述性量表 · {entryLabels[row.status]}</h3><p className="break-all">精确版本 {row.releaseId}</p><p>兼容入口：{row.supportedEntrypoints?.join('、') || '暂无可分配入口'}</p><div className="flex flex-wrap gap-2"><button type="button" className="hui-button hui-button--secondary" disabled={catalogDetailLoading} onClick={() => { const record = catalog.find(item => item.authored?.id === row.id); if (record) void inspectCatalog(record) }}>查看自编精确版本详情</button><button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={() => void loadGrants(row)}>查看 / 分配只读使用权限</button>{row.status !== 'EMERGENCY_DISABLED' && canReview(row.releaseId) && <><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || row.status !== 'ACTIVE' || !reason.trim()} onClick={() => void run(() => api.setStatus(row, 'WITHDRAWN', reason.trim(), reviewGrant(row.releaseId)), '已普通下架；历史记录保留。')}>普通下架</button><button type="button" className="hui-button hui-button--secondary text-red-700" disabled={busy || loading || !reason.trim()} onClick={() => { if (window.confirm('紧急停用将阻止此精确版本继续用于运行，可能影响正在进行的任务或波次；历史数据不会删除。确认紧急停用？\n原因：' + reason.trim())) void run(() => api.setStatus(row, 'EMERGENCY_DISABLED', reason.trim(), reviewGrant(row.releaseId)), '已紧急停用；历史数据保留。') }}>紧急停用（影响运行）</button></>}</div></article>)}
      {!catalog.length && !loading && <p>本页没有可见量表。</p>}<div className="flex gap-3 items-center mt-4" aria-label="公共量表目录分页"><button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || catalogPage <= 1} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page - 1) }}>目录上一页</button><span>目录第 {catalogPage} 页</span><button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || !catalogHasMore} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page + 1) }}>目录下一页</button></div>
      {catalogDetailLoading && <p role="status">正在读取精确目录详情…</p>}{catalogDetail && <section aria-label="公共量表精确版本详情" className="border rounded p-4 mt-3"><h3>{catalogDetail.title} · {catalogDetail.origin === 'STANDARD_REGISTRY' ? '标准科学身份保留 · 只读' : '自编描述性量表 · 精确获批版本'}</h3><p>目录与许可状态不替代目标入口的实际使用授权。以下是服务器按精确版本返回的详情。</p><pre tabIndex={0} role="region" aria-label={`目录版本内容：${catalogDetail.title}`} className="whitespace-pre-wrap break-all text-xs max-h-96 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">{JSON.stringify(catalogDetail, null, 2)}</pre></section>}
    </section>
  const grantPanel = selected && (!surveyContext || view === 'catalog') && <section ref={grantRegion} tabIndex={-1} className="staff-panel staff-panel--padded p-5 mt-4" aria-label="精确版本使用授权">
      <h2>{selected.metadata.title} · 只读使用授权</h2>
      <p className="break-all">版本 {selected.releaseId}。授权不包含改编；旧问卷不会自动升级。</p>
      {!grantLoaded && <p role="status">尚未确认现有授权，请重新读取该版本授权后再分配。</p>}
      <fieldset disabled={busy || loading || !grantLoaded || selected.status !== 'ACTIVE'}>
        <label>目标入口<select className="input block" value={product} onChange={event => {
          lookupGeneration.current++; setProduct(event.target.value as GovernanceTargetProduct); setPeople([]); setUserId('')
        }}>{(['TRAINING','SURVEY','SCHOOL','TEACHER'] as const).filter(target=>!surveyContext||target==='SURVEY').map(target=><option key={target} value={target} disabled={!targetReady(selected,target)}>{targetLabels[target]}</option>)}</select></label>
        {(['TRAINING','SURVEY','SCHOOL','TEACHER'] as const).filter(target=>(!surveyContext||target==='SURVEY')&&!targetReady(selected,target)).map(target=><p key={target}>
          {isEducationTarget(target)?targetLabels[target]:target}：{isEducationTarget(target)?educationDistributionReason(selected.educationDistribution?.products?.[target]?.reason||selected.compatibilityReasons?.[target]):selected.compatibilityReasons?.[target]||'当前版本暂未开放此入口的使用分配。'}</p>)}
        {canDistribute(selected, product) ? isEducationTarget(product)?<EducationLibraryDistributionPicker
          key={[selected.id,selected.releaseId,selected.contentHash,product,distributionGrant(selected.releaseId,product)].join(':')}
          entry={selected} product={product} grantId={distributionGrant(selected.releaseId,product)} grants={grants} api={api}
          disabled={busy||loading||!grantLoaded} run={run} onGranted={async()=>{
            const generation=lookupGeneration.current
            const response=await api.grants(selected.id)
            if(mounted.current&&generation===lookupGeneration.current)setGrants(response.list)
          }}/>:<>
          <label>查找授权账号<input className="input block" value={keyword} onChange={event=>setKeyword(event.target.value)}/></label>
          <button type="button" className="hui-button hui-button--secondary" onClick={()=>void loadPeople(1)}>读取可见授权对象</button>
          <label>授权对象<select className="input block" value={userId} onChange={event=>setUserId(event.target.value)}>
            <option value="">请选择已核对的账号</option>{people.map(person=><option key={person.id} value={person.id}>{person.name||person.username} · {person.username} · {person.id}</option>)}
          </select></label>
          {people.length>0&&<div><button type="button" disabled={peoplePage<=1} onClick={()=>void loadPeople(peoplePage-1)}>对象上一页</button><button type="button" disabled={!peopleHasMore} onClick={()=>void loadPeople(peoplePage+1)}>对象下一页</button></div>}
          <button type="button" className="hui-button hui-button--primary" disabled={!userId} onClick={()=>void run(assign,'已分配精确版本的只读使用授权。')}>授予所选账号只读使用</button>
        </>:<p>当前账号没有此版本在该入口的分配权限，或该入口尚未开放。</p>}
      </fieldset>
      {grants.filter(grant=>!surveyContext||grant.product==='SURVEY').map(grant=><article key={grant.id} className="border rounded p-3 mt-2">
        <p>{grant.product} · {grant.scopeKind==='ORGANIZATION'?'组织范围':'使用者'}{grant.organizationId?` · 学校 ${grant.organizationId}`:''} · {grant.userId??'无指定个人'} · {grant.status}</p>
        <SurveyLibraryDisclosure enabled={modernContext} label="管理此项授权">{canDistribute(selected,grant.product)&&grant.status==='ACTIVE'&&<button type="button" className="hui-button hui-button--secondary" disabled={busy||!reason.trim()} onClick={()=>void run(async()=>{
          await api.revoke(grant,reason.trim());const response=await api.grants(selected.id);if(mounted.current)setGrants(response.list)
        },'授权已撤销；历史记录保留。')}>撤销新增使用权限</button>}</SurveyLibraryDisclosure>
      </article>)}
    </section>
  const pendingCount = submissions.filter(row => row.status === 'SUBMITTED').length
  const visibleCatalog = catalog.filter(row=>!authoredOnly||row.origin==='AUTHORED')
  const pagination = <nav className="slg-pagination" aria-label="公共量表目录分页">
    <span>目录第 {catalogPage} 页 · 当前页 {catalog.length} 项</span><div>
      <button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || catalogPage <= 1} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page - 1) }}>目录上一页</button>
      <button type="button" className="hui-button hui-button--secondary" disabled={loading || busy || !catalogHasMore} onClick={() => { catalogDetailGeneration.current++; setCatalogDetailLoading(false); setCatalogDetail(null); setCatalogPage(page => page + 1) }}>目录下一页</button>
    </div>
  </nav>
  if (modernContext) return <ProductPage width="management"><div className={systemContext?"system-page system-library survey-library":"survey-admin survey-admin-governance survey-library"}>
    <header className="slg-header">
      <div><p className="slg-eyebrow">{systemContext?"共享内容 · 精确版本":"RESEARCH · 管理工作台"}</p><h1>{systemContext?"工具库治理":"工具库审批"}</h1><p className="slg-lead">{systemContext?"查阅共享工具，审核入库与全局使用状态。":"查阅量表、审核入库申请，管理精确版本的使用授权。"}</p></div>
      <div className="slg-header-actions"><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true"/>刷新状态</button></div>
    </header>
    {loading && <p role="status">正在核对治理权限…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {capabilities && <>
      <div className="slg-workspace"><div className="slg-main">
      <nav className="slg-views" aria-label="量表公库管理视图">
        <button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}><BookOpen size={18} aria-hidden="true"/><span>量表目录</span><span className="slg-count">本页 {catalog.length}</span></button>
        <button type="button" aria-pressed={view === 'submissions'} onClick={() => setView('submissions')}><ClipboardList size={18} aria-hidden="true"/><span>入库审批</span><span className="slg-count">待审 {pendingCount}</span></button>
      </nav>
        {view === 'catalog' ? <section className="slg-catalog" aria-label="公共量表总汇">
          <div className="slg-section-heading"><div><h2>公共量表总汇</h2><p>标准量表与已获批自编量表，保留各自的科学身份和版本。</p></div><span className="slg-page-label">第 {catalogPage} 页</span></div>
          {catalogDiscoveryControls}
          <p className="slg-result-count">第 {catalogPage} 页显示 {visibleCatalog.length} 个匹配版本。</p>
          <div className="slg-records">{visibleCatalog.map(row => {
            const entry = row.authored, standard = row.origin === 'STANDARD_REGISTRY'
            return <article key={row.catalogId} className="slg-record">
              <details className="slg-record-disclosure">
                <summary aria-label={'查看量表：'+row.title}>
                  <span className="slg-record-icon">{standard?<ShieldCheck size={21} aria-hidden="true"/>:<BookOpen size={21} aria-hidden="true"/>}</span>
                  <span className="slg-record-heading"><span className="slg-kind" data-kind={standard?'standard':'authored'}>{standard?'标准量表 · 只读':'自编描述性量表'}</span><h3>{row.title}</h3><CatalogClassificationTags tags={row.classificationTags}/><span className="slg-record-hint">{standard?'v'+row.exactVersion.instrumentVersion:'精确获批版本'} · 详情与操作</span></span>
                  <span className="slg-record-state"><span className="slg-availability">{entry?entryLabels[entry.status]:row.availability?.status==='NOT_AVAILABLE'?'暂不可用':'需核验授权'}</span><ChevronDown size={17} aria-hidden="true"/></span>
                </summary>
                <div className="slg-record-body">
              <p className="slg-record-description">{standard ? row.standard?.construct.constructDefinition || '查看精确详情，核对构念与科学证据。' : entry?.metadata.applicability || '查看精确获批版本与适用范围。'}</p>
              <dl className="slg-record-facts"><div><dt>{standard ? '版本' : '来源'}</dt><dd>{standard ? `${row.exactVersion.instrumentKey} · v${row.exactVersion.instrumentVersion}` : entry?.metadata.author || '待核对'}</dd></div><div><dt>{standard ? '版权状态' : '兼容入口'}</dt><dd>{standard ? scaleRightsStatusLabel(row.standard?.rights.status || '待核对') : entry?.supportedEntrypoints?.join(' / ') || '暂无可分配入口'}</dd></div></dl>
              {!standard && <p className="slg-version">精确版本 <span>{row.exactVersion.releaseId}</span></p>}
              {entry && <EducationApplicabilitySummary value={entry.educationApplicability} hash={entry.educationApplicabilityHash}/>}
              <div className="slg-record-actions"><button type="button" className="hui-button hui-button--secondary" disabled={catalogDetailLoading} onClick={() => void inspectCatalog(row)}><FileSearch size={15} aria-hidden="true"/>{standard ? '查看标准精确版本详情' : '查看自编精确版本详情'}</button>
                {entry && <><button type="button" className="hui-button hui-button--secondary" disabled={busy} onClick={() => void loadGrants(entry)}>查看 / 分配只读使用权限</button>
                  {entry.status !== 'EMERGENCY_DISABLED' && canReview(entry.releaseId) && <details className="slg-danger-actions"><summary>状态操作</summary><div><p>请先在“操作说明”填写原因。</p><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || entry.status !== 'ACTIVE' || !reason.trim()} onClick={() => void run(() => api.setStatus(entry, 'WITHDRAWN', reason.trim(), reviewGrant(entry.releaseId)), '已普通下架；历史记录保留。')}>普通下架</button><button type="button" className="hui-button hui-button--secondary" disabled={busy || loading || !reason.trim()} onClick={() => { if (window.confirm('紧急停用将阻止此精确版本继续用于运行，可能影响正在进行的任务或波次；历史数据不会删除。确认紧急停用？\n原因：' + reason.trim())) void run(() => api.setStatus(entry, 'EMERGENCY_DISABLED', reason.trim(), reviewGrant(entry.releaseId)), '已紧急停用；历史数据保留。') }}>紧急停用（影响运行）</button></div></details>}
                </>}
              </div>
                </div>
              </details>
            </article>
          })}</div>
          {!visibleCatalog.length && !loading && !error && <div className="slg-empty"><BookOpen size={28} aria-hidden="true"/><h3>没有匹配的可见量表</h3><p>调整分类或关键词后重新检索；获批收录的版本仍须单独授权。</p></div>}
          {pagination}
          {catalogDetailLoading && <p role="status">正在读取精确目录详情…</p>}
          {catalogDetail && <section ref={detailRegion} tabIndex={-1} className="slg-detail" aria-label="公共量表精确版本详情"><div className="slg-section-heading"><div><p className="slg-eyebrow">精确版本详情</p><h2>{catalogDetail.title}</h2></div><button type="button" className="hui-button hui-button--secondary" onClick={() => { catalogDetailGeneration.current++; setCatalogDetail(null) }}>收起详情</button></div>
            <p className="slg-detail-note">{catalogDetail.origin === 'STANDARD_REGISTRY' ? '标准科学身份保留 · 只读' : '自编描述性量表 · 精确获批版本'}。目录与许可状态不替代目标入口的实际使用授权。</p>
            <dl className="slg-detail-facts"><div><dt>精确版本</dt><dd>{catalogDetail.exactVersion.instrumentKey || catalogDetail.exactVersion.releaseId} {catalogDetail.exactVersion.instrumentVersion && `· v${catalogDetail.exactVersion.instrumentVersion}`}</dd></div><div><dt>适用范围 / 构念</dt><dd>{catalogDetail.standard?.construct.constructDefinition || catalogDetail.authored?.metadata.applicability || '请查看完整版本记录'}</dd></div><div><dt>作者 / 来源</dt><dd>{catalogDetail.standard?.source?.citation || catalogDetail.standard?.source?.title || catalogDetail.authored?.metadata.author || '未提供'}</dd></div><div><dt>科学证据 / 计分</dt><dd>{catalogDetail.standard?.evidence.coverageText || catalogDetail.authored?.metadata.scoringDescription || '请查看完整版本记录'}</dd></div></dl>
            <details className="slg-raw"><summary>完整版本记录</summary><pre tabIndex={0} role="region" aria-label={`目录版本内容：${catalogDetail.title}`}>{JSON.stringify(catalogDetail, null, 2)}</pre></details>
          </section>}
          {grantPanel}
        </section> : applicationPanel}
      </div><aside className="slg-sidebar" aria-label="审核与授权说明">
        <section className="slg-side-panel"><div className="slg-side-title"><ClipboardList size={17} aria-hidden="true"/><h2>操作说明</h2></div><p className="slg-side-intro">审批与权限变更，保留清楚的处理依据。</p><details className="slg-side-disclosure"><summary>填写操作说明<ChevronDown size={16} aria-hidden="true"/></summary><div><p>审批、下架或撤权前，填写本次操作的具体原因。</p><label htmlFor="slg-reason">审核、下架或撤权说明</label><textarea id="slg-reason" placeholder="例如：已核对版权、冻结题目与计分规则……" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} rows={5}/><span className="slg-side-hint">原因不会单独保存，执行操作时一并提交。</span></div></details></section>
        <section className="slg-side-panel slg-rules"><div className="slg-side-title"><ShieldCheck size={17} aria-hidden="true"/><h2>审核与授权</h2></div><details className="slg-side-disclosure"><summary>查看审核流程<ChevronDown size={16} aria-hidden="true"/></summary><div><ol><li><strong>核对精确版本</strong><p>题目、计分、报告与固定附件均需审核。</p></li><li><strong>决定是否收录</strong><p>批准入库后，仍需单独分配使用权限。</p></li><li><strong>按入口授权使用</strong><p>{systemContext?"按实际入口资格与精确版本核对分发权限；Survey 研究者分配由独立 Survey 管理员处理。":"此处仅分配 Survey 的只读使用权限，不包含改编。"}</p></li></ol><details><summary>查看管理边界与停用影响</summary>{permissionNotes}<p>普通下架或撤权停止新增使用，保留历史和既有绑定；紧急停用可能影响正在进行的任务或波次。历史答卷与报告不删除。</p></details></div></details></section>
      </aside></div>
    </>}
  </div></ProductPage>
  return <ProductPage width="reading"><div><PageHeader title="公共量表库与授权治理" description="查看精确版本，处理入库申请与只读使用授权。"/><section className="staff-panel staff-panel--padded p-5 space-y-2"><h2>两类权限分别管理</h2>{permissionNotes}</section>{loading && <p role="status">正在核对治理权限…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<button type="button" className="hui-button hui-button--secondary" disabled={busy || loading} onClick={() => void refresh()}>刷新状态</button>{capabilities && <>{applicationPanel}{legacyCatalog}{grantPanel}</>}</div></ProductPage>
}
