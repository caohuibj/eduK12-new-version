import { formatLocalTimestamp } from '../../utils/dateTime'
import ManagementDialog from '../../components/staff-ui/ManagementDialog'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { runApi, type EvaluationTargetMode, type RunResourceChoice, type RunPreview, type AssessmentRunDetail, type RunActorRole, type RunAnalysisMode, type RunPerspective, type RunPopulationSelector, type RunProgressProjection, type RunRelationshipKind, type RunResourceFamily } from '../../api/runs'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const ACTOR_ROLES: RunActorRole[] = ['STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT']
const RELATIONSHIPS: RunRelationshipKind[] = ['SELF', 'PARENT_CHILD', 'COURSE_TEACHER_STUDENT', 'CLASS_TEACHER_STUDENT', 'COUNSELOR_CLIENT']
const PERSPECTIVES: RunPerspective[] = ['SELF_REPORT', 'OBSERVER_REPORT', 'RELATIONAL_EXPERIENCE']
const ANALYSIS_MODES: RunAnalysisMode[] = ['INDIVIDUAL_ONLY', 'COHORT_AGGREGATE', 'MULTI_INFORMANT_SYNTHESIS']
const RESOURCE_FAMILIES: RunResourceFamily[] = ['BUNDLE', 'SCALE', 'FORM', 'SITUATIONAL']
const SELECTOR_KINDS = ['ALL_CURRENT', 'MEMBERSHIP_IDS', 'CLASS_UNITS', 'LABELS', 'RELATED_PARENT'] as const
const RESPONDENT_SELECTOR_KINDS = SELECTOR_KINDS

type SelectorKind = typeof SELECTOR_KINDS[number] | 'RELATED_PARENT'
const splitIds = (value: string) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
const buildSelector = (kind: SelectorKind, values: string): RunPopulationSelector => {
  if (kind === 'ALL_CURRENT' || kind === 'RELATED_PARENT') return { kind }
  const ids = splitIds(values)
  if (kind === 'MEMBERSHIP_IDS') return { kind, membershipIds: ids }
  if (kind === 'CLASS_UNITS') return { kind, classUnitIds: ids }
  return { kind, labelIds: ids, match: 'ANY' }
}
const selectorText = (selector: RunPopulationSelector) => {
  if (selector.kind === 'ALL_CURRENT') return '全部当前符合条件成员'
  if (selector.kind === 'RELATED_PARENT') return '冻结时解析相关家长'
  if (selector.kind === 'MEMBERSHIP_IDS') return `Membership: ${selector.membershipIds.join(', ')}`
  if (selector.kind === 'CLASS_UNITS') return `Class: ${selector.classUnitIds.join(', ')}`
  return `Label(${selector.match}): ${selector.labelIds.join(', ')}`
}
const formatTime = (value: string | null) => value ? formatLocalTimestamp(value) : '—'
const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback

export default function OrganizationRunDetailPage() {
  const { organizationId = '', runId = '' } = useParams<{ organizationId: string; runId: string }>()
  const { active, activeLoading, activeError, selectOrganization } = useOrganization()
  const context = active?.organization.id === organizationId ? active : null
  const canGovern = context?.allowedActions.some(action => action === 'ASSESSMENT_DELIVERY' || action === 'RUNS') === true
  const [detail, setDetail] = useState<AssessmentRunDetail | null>(null)
  const [progress, setProgress] = useState<RunProgressProjection | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = useState<RunPreview | null>(null)

  const [targetMode, setTargetMode] = useState<EvaluationTargetMode | ''>('')
  const [targetIds, setTargetIds] = useState('')
  const [targetCourse, setTargetCourse] = useState('')
  const [resources, setResources] = useState<RunResourceChoice[]>([])
  const [selectedResource, setSelectedResource] = useState<RunResourceChoice | null>(null)
  const [resourceFamily, setResourceFamily] = useState<RunResourceFamily>('BUNDLE')
  const [resourceKey, setResourceKey] = useState('')
  const [resourceVersion, setResourceVersion] = useState('1.0.0')
  const [subjectSelectorKind, setSubjectSelectorKind] = useState<SelectorKind>('ALL_CURRENT')
  const [subjectSelectorValues, setSubjectSelectorValues] = useState('')
  const [respondentSelectorKind, setRespondentSelectorKind] = useState<SelectorKind>('ALL_CURRENT')
  const [respondentSelectorValues, setRespondentSelectorValues] = useState('')
  const [subjectRole, setSubjectRole] = useState<RunActorRole>('STUDENT')
  const [respondentRole, setRespondentRole] = useState<RunActorRole>('STUDENT')
  const [relationshipKind, setRelationshipKind] = useState<RunRelationshipKind>('SELF')
  const [perspective, setPerspective] = useState<RunPerspective>('SELF_REPORT')
  const [analysisMode, setAnalysisMode] = useState<RunAnalysisMode>('INDIVIDUAL_ONLY')
  const [visibilityPolicyKey, setVisibilityPolicyKey] = useState('ORG_SELF_V1')
  const [minimumRespondents, setMinimumRespondents] = useState('')

  useEffect(() => {
    if (!organizationId || context || activeLoading) return
    void selectOrganization(organizationId)
  }, [organizationId, context, activeLoading, selectOrganization])

  const load = useCallback(async () => {
    if (!organizationId || !runId || !canGovern) return
    setLoading(true)
    setLoadError(null)
    setProgress(null)
    try {
      const next = await runApi.detail(organizationId, runId)
      setDetail(next)
      if (next.run.status === 'DRAFT') { setProgress(null); setResources((await runApi.resources(organizationId)).list) }
      else {
        try { setProgress(await runApi.progress(organizationId, runId)) }
        catch (err) { setLoadError(errorText(err, '执行进度读取失败，请重试。')) }
      }
    } catch (err) {
      setDetail(null)
      setLoadError(errorText(err, '无法加载 Run'))
    } finally {
      setLoading(false)
    }
  }, [organizationId, runId, canGovern])

  useEffect(() => { void load() }, [load])

  const mutate = useCallback(async (successMessage: string, action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setMutationError(null)
    setNotice(null)
    try {
      await action()
      setNotice(successMessage)
      await load()
    } catch (err) {
      setMutationError(errorText(err, 'Run 操作失败'))
      await load()
    } finally {
      setBusy(false)
    }
  }, [busy, load])

  const chooseResource = (index: string) => {
    const resource = resources[Number(index)]
    if (!resource) return
    setSelectedResource(resource)
    setTargetMode(resource.allowedTargetModes?.[0] ?? '')
    setTargetIds(''); setTargetCourse('')
    setResourceFamily(resource.family)
    setResourceKey(resource.key)
    setResourceVersion(resource.version)
    setSubjectRole(resource.subjectRoles[0] as RunActorRole)
    setRespondentRole(resource.respondentRoles[0] as RunActorRole)
    setRelationshipKind(resource.relationshipKinds[0] as RunRelationshipKind)
    setPerspective(resource.perspectives[0] as RunPerspective)
    setAnalysisMode(resource.analysisMode as RunAnalysisMode)
    setVisibilityPolicyKey(resource.visibilityPolicyKey)
    setMinimumRespondents(resource.minimumRespondents === null ? '' : String(resource.minimumRespondents))
  }

  const previewPublish = async () => {
    if (!detail || busy) return
    setBusy(true)
    setMutationError(null)
    setConfirmPublish(null)
    try { setConfirmPublish(await runApi.preview(organizationId, runId, detail.run.version)) }
    catch (err) { setMutationError(errorText(err, '发布预览失败')); await load() }
    finally { setBusy(false) }
  }

  const addTrack = async (event: FormEvent) => {
    event.preventDefault()
    if (!resourceKey.trim() || !resourceVersion.trim()) return
    const subjectSelector = buildSelector(subjectSelectorKind, subjectSelectorValues)
    const respondentSelector = buildSelector(respondentSelectorKind, respondentSelectorValues)
    const selectorsNeedIds = [subjectSelector, respondentSelector].some((selector) =>
      (selector.kind === 'MEMBERSHIP_IDS' && selector.membershipIds.length === 0) ||
      (selector.kind === 'CLASS_UNITS' && selector.classUnitIds.length === 0) ||
      (selector.kind === 'LABELS' && selector.labelIds.length === 0),
    )
    if (selectorsNeedIds) {
      setMutationError('所选 selector 需要至少一个 ID。多个 ID 使用英文逗号分隔。')
      return
    }
    const minimum = minimumRespondents.trim() ? Number(minimumRespondents) : null
    if (minimumRespondents.trim() && (!Number.isInteger(minimum) || (minimum ?? 0) < 1)) {
      setMutationError('minimumRespondents 必须为空或正整数。')
      return
    }
    await mutate('Track 已加入 DRAFT；发布前仍可继续加入其他 Track。', () => runApi.addTrack(organizationId, runId, {
      resource: { family: resourceFamily, key: resourceKey.trim(), version: resourceVersion.trim() },
      subjectSelector,
      respondentSelector,
      requestedPolicy: {
        ...(targetMode ? { targetPolicy: { mode: targetMode, ...(targetMode === 'SELECTED_CLASS_TEACHERS' ? { teacherMembershipIds: targetIds.split(/[\s,]+/).filter(Boolean) } : {}), ...(targetMode === 'COURSE_TEACHER' ? { courseId: targetCourse } : {}) } } : {}),
        subjectRoles: [subjectRole],
        respondentRoles: [respondentRole],
        relationshipKinds: [relationshipKind],
        perspectives: [perspective],
        analysisMode,
        visibilityPolicyKey: visibilityPolicyKey.trim(),
        minimumRespondents: minimum,
      },
    }))
  }

  const totalFrozenActors = useMemo(() => detail?.frozenPopulation.actors.reduce((sum, item) => sum + item.count, 0) ?? 0, [detail])
  const totalFrozenRelationships = useMemo(() => detail?.frozenPopulation.relationships.reduce((sum, item) => sum + item.count, 0) ?? 0, [detail])

  if (activeLoading && !context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  if (!context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="error" title="无法进入测评批次" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>
  if (!canGovern) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="warning" title="无测评批次管理权限" actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}`}>返回组织空间</Link>}>当前服务器未授予测评投放权限。</ProductStatus></ProductPage>
  if (loading && !detail) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="pending" title="正在加载测评批次">正在读取 Run graph 的服务器投影。</ProductStatus></ProductPage>
  if (!detail) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="error" title="测评批次无法加载" actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}/runs`}>返回测评批次</Link>}>{loadError || '测评批次不存在或当前不可访问。'}</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="hui-organization-page">
      <PageHeader
        title={detail.run.name}
        description={`状态：${detail.run.status} · 版本 ${detail.run.version} · 测评项目 ${detail.run.trackCount} · 执行记录 ${detail.run.executionCount}`}
        actions={<div className="flex flex-wrap gap-3"><Link to={`/organizations/${encodeURIComponent(organizationId)}/runs`}>测评批次</Link>{detail.run.status === 'DRAFT' && <ProductButton variant="primary" disabled={busy || detail.tracks.length === 0} onClick={() => void previewPublish()}>发布测评批次</ProductButton>}{detail.run.status === 'PUBLISHED' && <><ProductButton disabled={busy} onClick={() => void mutate('Run 已关闭。', () => runApi.close(organizationId, runId))}>关闭测评批次</ProductButton><ProductButton variant="danger" disabled={busy} onClick={() => void mutate('Run 已取消。', () => runApi.cancel(organizationId, runId))}>取消测评批次</ProductButton></>}</div>}
      />
      {confirmPublish && detail.run.status === 'DRAFT' && <ManagementDialog open title="确认发布测评" width="wide" closeDisabled={busy} onClose={() => setConfirmPublish(null)}>
        <h2 className="font-semibold">确认发布测评</h2>
        <ul>{confirmPublish.tracks.map(track => <li key={track.trackId}>测评项目 {track.trackId}：受测者 {track.subjectCount}，评价者 {track.respondentCount}，任务 {track.executionCount}</li>)}</ul>
        <p>将按当前显示的 {detail.tracks.length} 个测评项目发布。服务器会重新检查资源限制、成员与关系；发布后配置不可修改。</p>
        <ProductButton disabled={busy} onClick={() => setConfirmPublish(null)}>返回检查</ProductButton>
        <ProductButton disabled={busy} variant="primary" onClick={() => { setConfirmPublish(null); void mutate('Run 已发布；人口、资源与策略身份已冻结。', () => runApi.publish(organizationId, runId, confirmPublish.version)) }}>确认发布</ProductButton>
      </ManagementDialog>}
      {loadError && <ProductStatus kind="error" title="刷新失败">{loadError}</ProductStatus>}
      {mutationError && <ProductStatus kind="error" title="测评批次操作失败" announce="assertive">{mutationError}</ProductStatus>}
      {notice && <ProductStatus kind="success" title="测评批次已更新" announce="polite">{notice}</ProductStatus>}

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="测评批次生命周期">
        <div><span className="text-sm text-slate-500">创建时间</span><p className="mt-1 font-medium">{formatTime(detail.run.createdAt)}</p></div>
        <div><span className="text-sm text-slate-500">参与截止</span><p className="mt-1 font-medium">{formatTime(detail.run.intakeDeadline)}</p></div>
        <div><span className="text-sm text-slate-500">发布时间</span><p className="mt-1 font-medium">{formatTime(detail.run.publishedAt)}</p></div>
        <div><span className="text-sm text-slate-500">终态时间</span><p className="mt-1 font-medium">{formatTime(detail.run.closedAt || detail.run.cancelledAt)}</p></div>
      </section>

      {detail.run.status === 'DRAFT' && (
        <section className="mt-8 space-y-4" aria-labelledby="run-add-track-heading">
          <div><h2 id="run-add-track-heading" className="text-xl font-semibold text-slate-900">添加测评项目</h2><p className="mt-1 text-sm text-slate-600">选择已发布测量资源与参与者。发布时服务器会重新核对权限，并冻结内容、成员身份及关系。</p></div>
          {resources.length === 0 && <ProductStatus kind="info" title="暂无已发布的可用资源">当前没有已发布且已授权给您的组织测量资源。请由平台管理员在“测量与报告方案”中注册并发布资源，再在原材料页面授权给指定教师。课程量表发布不会自动进入此目录。</ProductStatus>}
          <label className="grid gap-1 text-sm font-medium">已发布资源<select aria-label="已发布资源" className="min-h-11 rounded-lg border px-3" defaultValue="" onChange={event => chooseResource(event.target.value)}><option value="" disabled>请选择资源</option>{resources.map((item, index) => <option key={`${item.family}:${item.key}:${item.version}`} value={index}>{item.title} · {item.family}/{item.key}@{item.version}</option>)}</select></label>
          <form className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-3" onSubmit={addTrack}>
            {selectedResource?.allowedTargetModes?.length ? <fieldset className="space-y-2 lg:col-span-3"><legend>评价对象（由服务器解析关系）</legend><select aria-label="评价对象模式" value={targetMode} onChange={e => setTargetMode(e.target.value as EvaluationTargetMode)}>{selectedResource.allowedTargetModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}</select>{targetMode === 'SELECTED_CLASS_TEACHERS' && <input aria-label="指定教师成员编号" value={targetIds} onChange={e => setTargetIds(e.target.value)} placeholder="教师成员编号，以逗号分隔" />}{targetMode === 'COURSE_TEACHER' && <input aria-label="评价课程编号" value={targetCourse} onChange={e => setTargetCourse(e.target.value)} placeholder="课程编号" />}<p>指定编号只会收窄合法关系范围，不能新增评价对象。</p></fieldset> : null}
            <label className="grid gap-1 text-sm font-medium">资源类型<select className="min-h-11 rounded-lg border border-slate-300 px-3" disabled value={resourceFamily} onChange={(event) => setResourceFamily(event.target.value as RunResourceFamily)}>{RESOURCE_FAMILIES.map((family) => <option key={family}>{family}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">资源 key<input className="min-h-11 rounded-lg border border-slate-300 px-3" readOnly value={resourceKey} onChange={(event) => setResourceKey(event.target.value)} /></label>
            <label className="grid gap-1 text-sm font-medium">资源 version<input className="min-h-11 rounded-lg border border-slate-300 px-3" readOnly value={resourceVersion} onChange={(event) => setResourceVersion(event.target.value)} /></label>
            <label className="grid gap-1 text-sm font-medium">Subject selector<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={subjectSelectorKind} onChange={(event) => setSubjectSelectorKind(event.target.value as SelectorKind)}>{SELECTOR_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Subject IDs<input className="min-h-11 rounded-lg border border-slate-300 px-3" disabled={subjectSelectorKind === 'ALL_CURRENT'} value={subjectSelectorValues} onChange={(event) => setSubjectSelectorValues(event.target.value)} placeholder="多个 ID 用英文逗号分隔" /></label>
            <label className="grid gap-1 text-sm font-medium">Subject role<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={subjectRole} onChange={(event) => setSubjectRole(event.target.value as RunActorRole)}>{(selectedResource?.subjectRoles ?? ACTOR_ROLES).map((role) => <option key={role}>{role}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Respondent selector<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={respondentSelectorKind} onChange={(event) => setRespondentSelectorKind(event.target.value as SelectorKind)}>{RESPONDENT_SELECTOR_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Respondent IDs<input className="min-h-11 rounded-lg border border-slate-300 px-3" disabled={respondentSelectorKind === 'ALL_CURRENT' || respondentSelectorKind === 'RELATED_PARENT'} value={respondentSelectorValues} onChange={(event) => setRespondentSelectorValues(event.target.value)} placeholder="多个 ID 用英文逗号分隔" /></label>
            <label className="grid gap-1 text-sm font-medium">Respondent role<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={respondentRole} onChange={(event) => setRespondentRole(event.target.value as RunActorRole)}>{(selectedResource?.respondentRoles ?? ACTOR_ROLES).map((role) => <option key={role}>{role}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Relationship<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value as RunRelationshipKind)}>{(selectedResource?.relationshipKinds ?? RELATIONSHIPS).map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Perspective<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={perspective} onChange={(event) => setPerspective(event.target.value as RunPerspective)}>{(selectedResource?.perspectives ?? PERSPECTIVES).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Analysis mode<select className="min-h-11 rounded-lg border border-slate-300 px-3" disabled value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as RunAnalysisMode)}>{ANALYSIS_MODES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Visibility policy key<input className="min-h-11 rounded-lg border border-slate-300 px-3" readOnly value={visibilityPolicyKey} onChange={(event) => setVisibilityPolicyKey(event.target.value)} /></label>
            <label className="grid gap-1 text-sm font-medium">Minimum respondents<input type="number" min={selectedResource?.minimumRespondents ?? 1} className="min-h-11 rounded-lg border border-slate-300 px-3" value={minimumRespondents} onChange={(event) => setMinimumRespondents(event.target.value)} placeholder="空 = null" /></label>
            <div className="flex items-end"><ProductButton type="submit" variant="primary" disabled={busy || !selectedResource || !resourceKey.trim() || !resourceVersion.trim() || !visibilityPolicyKey.trim()}>添加测评项目</ProductButton></div>
          </form>
        </section>
      )}

      <section className="mt-8 space-y-4" aria-labelledby="run-tracks-heading">
        <div><h2 id="run-tracks-heading" className="text-xl font-semibold text-slate-900">测评项目与冻结事实</h2><p className="mt-1 text-sm text-slate-600">DRAFT 显示声明的 selector/policy；PUBLISHED 后额外显示服务器冻结的 resource policy hash 与人口摘要。</p></div>
        <div className="grid gap-4">{detail.tracks.map((track, index) => <article key={track.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">测评项目 {index + 1}: {track.resourceFamily}/{track.resourceKey}@{track.resourceVersion}</h3>{track.resourcePolicyHash && <span className="break-all font-mono text-xs text-slate-500">policy hash {track.resourcePolicyHash}</span>}</div><dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="font-medium">Subject selector</dt><dd className="text-slate-600">{selectorText(track.subjectSelector)}</dd></div><div><dt className="font-medium">Respondent selector</dt><dd className="text-slate-600">{selectorText(track.respondentSelector)}</dd></div><div><dt className="font-medium">Policy</dt><dd className="text-slate-600">{track.requestedPolicy.subjectRoles.join('/')} → {track.requestedPolicy.respondentRoles.join('/')} · {track.requestedPolicy.relationshipKinds.join('/')} · {track.requestedPolicy.perspectives.join('/')}</dd></div><div><dt className="font-medium">Analysis / visibility</dt><dd className="text-slate-600">{track.requestedPolicy.analysisMode} · {track.requestedPolicy.visibilityPolicyKey} · min {track.requestedPolicy.minimumRespondents ?? 'null'}</dd></div></dl>{track.frozenResourcePolicy != null && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">查看冻结 resource policy</summary><pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(track.frozenResourcePolicy, null, 2)}</pre></details>}</article>)}{detail.tracks.length === 0 && <ProductStatus kind="info" title="尚无测评项目">至少添加一个测评项目后才可发布。</ProductStatus>}</div>
      </section>

      {detail.run.status !== 'DRAFT' && (
        <section className="mt-8 space-y-4" aria-labelledby="run-frozen-heading">
          <div><h2 id="run-frozen-heading" className="text-xl font-semibold text-slate-900">冻结人口与执行</h2><p className="mt-1 text-sm text-slate-600">发布后这些数字来自 frozen snapshot/execution 表，不按当前 Membership 或班级关系重新计算。</p></div>
          <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><strong>Actor snapshots · {totalFrozenActors}</strong><ul className="mt-2 text-sm text-slate-600">{detail.frozenPopulation.actors.map((item) => <li key={`${item.provenanceKind}-${item.actorRole}`}>{item.provenanceKind} / {item.actorRole}: {item.count}</li>)}</ul></div><div className="rounded-xl border border-slate-200 bg-white p-4"><strong>Relationship snapshots · {totalFrozenRelationships}</strong><ul className="mt-2 text-sm text-slate-600">{detail.frozenPopulation.relationships.map((item) => <li key={item.relationshipKind}>{item.relationshipKind}: {item.count}</li>)}</ul></div><div className="rounded-xl border border-slate-200 bg-white p-4"><strong>Execution records · {detail.run.executionCount}</strong><ul className="mt-2 text-sm text-slate-600">{detail.executions.map((item) => <li key={item.status}>{item.status}: {item.count}</li>)}</ul></div></div>
        </section>
      )}

      {progress && (
        <section className="mt-8 space-y-4" aria-labelledby="run-progress-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="run-progress-heading" className="text-xl font-semibold text-slate-900">执行进度</h2><p className="mt-1 text-sm text-slate-600">progress 状态由 execution、start claim 与 runtime binding 的当前服务端状态合成。</p></div><ProductButton disabled={loading} onClick={() => void load()}>刷新进度</ProductButton></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(progress.counts).map(([state, count]) => <div key={state} className="rounded-xl border border-slate-200 bg-white p-4"><span className="text-sm text-slate-500">{state}</span><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div></section>
      )}
    </ProductPage>
  )
}
