import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'
import { AdminPermissionError } from '../admin-permissions/service'
import { getScaleInstrumentSource } from '../scale/onboarding/instrument-registry'
import { validateScaleInstrumentSource } from '../scale/onboarding/validate-instrument'
import { planStandardScalePublication } from '../scale/onboarding/publish'
import { projectScalePackage } from '../scale/onboarding/define-instrument'
import { evaluateScaleProductReadiness } from '../scale/library/product-readiness'
import { registeredSelfAuthoredSourceProof } from '../scale/onboarding/self-authored'
import { readActiveScaleDeployment } from '../scale/deployment/repository'
import { assertStandardSystem, type StandardRelease } from './standard-triplet.service'
import { readOnlineStandardSnapshot } from './standard-triplet.catalog'
import { readToolPolicy } from './tool-policy'

type Db = PrismaClient | Prisma.TransactionClient
type Stage = { key: 'source' | 'installation' | 'publication' | 'approval' | 'assignment'; label: string; state: 'COMPLETE' | 'READY' | 'BLOCKED' | 'PENDING'; reasons: string[]; nextAction: string }
export type LibraryPreflight = {
  identity: { instrumentKey: string; instrumentVersion: string }; title: string; readOnly: true
  facts: { catalogStatus: string; scientificMaturity: string; contentLocale: string | null; scientificTerritory: string | null; authorship: 'SELF_AUTHORED' | 'EXTERNAL_OR_UNCONFIRMED'; scaleId: string | null; scaleStatus: string | null; visibility: string | null; deploymentRevision: number | null; deploymentTerritory: string | null; approvedReleaseId: string | null }
  stages: Stage[]; targetUseGrant: 'NOT_EVALUATED'; generatedAt: string
}

const unique = (values: string[]) => [...new Set(values)]

/** Read model only. No install/publish/approve/trial/grant function is called.
 * Plans expose real product blockers; a CLI/test harness's extra preconditions
 * cannot silently become API or scientific requirements. */
export async function libraryPreflight(actor: string, key: string, version: string, db: Db = prisma): Promise<LibraryPreflight> {
  await assertStandardSystem(db, actor)
  const source = getScaleInstrumentSource(key, version)
  if (!source) throw new AdminPermissionError(404, '精确来源版本不存在')
  const pkg = projectScalePackage(source)
  const sourceReasons = unique([
    ...validateScaleInstrumentSource(source).issues.filter(issue => issue.severity === 'error').map(issue => `${issue.path}: ${issue.message}`),
    ...(pkg ? evaluateScaleProductReadiness(pkg).blockers.map(issue => `${issue.stage}：${issue.message}`) : ['仅有目录资料，尚缺可执行题目、计分与报告版本包']),
  ])
  const scale = await db.scale.findUnique({ where: { code: key }, select: { id: true, instrumentVersion: true, status: true, visibility: true } })
  const deployment = scale ? await readActiveScaleDeployment(db, scale.id) : null
  // The existing publication plan contains install consistency, rights,
  // localization, reference and scientific checks. Do not reconstruct them.
  const publication = pkg ? await planStandardScalePublication(db, { instrumentKey: key, instrumentVersion: version, actorUserId: actor, visibility: 'HIDDEN' }) : null
  const history = await db.$queryRaw<StandardRelease[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE tool_key=${key} AND snapshot->>'instrumentVersion'=${version} ORDER BY created_at DESC,id LIMIT 50`)
  const online = history.find(release => release.state === 'ONLINE')
  const installationReasons = unique([
    ...(!scale ? ['尚未安装该来源版本'] : scale.instrumentVersion !== version ? ['已安装的是其他内容版本，不能覆盖原精确版本'] : []),
    ...(!deployment ? ['尚无激活的部署修订'] : []),
    ...(publication?.blockers.filter(reason => reason !== 'SCALE_NOT_INSTALLED' && reason !== 'DEPLOYMENT_BINDING_MISSING') ?? []),
  ])
  const assignmentReasons: string[] = []
  if (!online) assignmentReasons.push('尚无通过系统批准与自动试运行的精确版本组合')
  else {
    try {
      await readOnlineStandardSnapshot(db, 'survey-standard:' + online.id, online.combination_hash)
      const policy = await readToolPolicy(db, { resourceKey: 'standard-release:' + online.id, fingerprint: online.combination_hash })
      if (policy.decision === 'RETURNED') assignmentReasons.push('Survey 范围审批已退回：' + policy.reason)
      if (policy.paused) assignmentReasons.push('Survey 新增分配和投放已暂停：' + policy.reason)
    } catch (error) {
      if (!(error instanceof AdminPermissionError)) throw error
      assignmentReasons.push(error.message)
    }
  }
  const latest = history[0]
  return {
    identity: source.identity, title: source.catalog.identity.canonicalName, readOnly: true,
    facts: { catalogStatus: source.catalog.catalogStatus, scientificMaturity: source.catalog.scientificMaturity,
      contentLocale: source.executable?.contentLocale ?? source.localization?.targetLocale ?? null, scientificTerritory: source.scientificReview?.territory ?? null,
      authorship: registeredSelfAuthoredSourceProof(key, version) ? 'SELF_AUTHORED' : 'EXTERNAL_OR_UNCONFIRMED',
      scaleId: scale?.id ?? null, scaleStatus: scale?.status ?? null, visibility: scale?.visibility ?? null,
      deploymentRevision: deployment?.revision ?? null, deploymentTerritory: deployment?.policy.territory ?? null, approvedReleaseId: online?.id ?? null },
    stages: [
      { key: 'source', label: '来源与内容预检', state: sourceReasons.length ? 'BLOCKED' : 'COMPLETE', reasons: sourceReasons, nextAction: sourceReasons.length ? '补齐列明的来源或内容问题后重新预检' : '来源资料与可执行包已具备；保留当前科学成熟度' },
      { key: 'installation', label: '安装入库', state: !installationReasons.length ? 'COMPLETE' : !scale && !sourceReasons.length ? 'PENDING' : 'BLOCKED', reasons: installationReasons, nextAction: '通过既有受控安装流程处理；本预检不会执行入库或更改部署修订' },
      { key: 'publication', label: '测量正式发布', state: !publication ? 'BLOCKED' : publication.blockers.length ? 'BLOCKED' : scale?.status === 'PUBLISHED' ? 'COMPLETE' : 'READY', reasons: publication?.blockers ?? ['没有可执行版本，不能正式发布'], nextAction: '按真实发布预览复核；受控库使用 HIDDEN，目标用户授权另行处理' },
      { key: 'approval', label: '精确版本批准与试运行', state: online ? 'COMPLETE' : latest?.state === 'TRIAL_FAILED' || latest?.state === 'WITHDRAWN' ? 'BLOCKED' : 'PENDING', reasons: online ? [] : latest ? [latest.state === 'TRIAL_FAILED' ? '自动试运行失败' : latest.state === 'WITHDRAWN' ? '该精确组合已停止新增使用' : '当前审批状态：' + latest.state, ...latest.blockers] : ['尚无本流程的批准记录'], nextAction: '在下方核对内容、参数、报告；仅对明确选择的精确组合批准或重试' },
      { key: 'assignment', label: 'Survey 可分配状态', state: assignmentReasons.length ? 'BLOCKED' : 'READY', reasons: assignmentReasons, nextAction: '由 Survey 入口管理员为明确目标逐项授权；投放时重新检查当前权限与冻结版本' },
    ], targetUseGrant: 'NOT_EVALUATED', generatedAt: new Date().toISOString(),
  }
}

export async function libraryPreflightBatch(actor: string, identities: Array<{ instrumentKey: string; instrumentVersion: string }>) {
  await assertStandardSystem(prisma, actor)
  if (!identities.length || identities.length > 10) throw new AdminPermissionError(400, '每次只读预检需要1–10个明确版本')
  const keys = identities.map(identity => JSON.stringify([identity.instrumentKey, identity.instrumentVersion]))
  if (new Set(keys).size !== keys.length) throw new AdminPermissionError(400, '不能重复选择同一精确版本')
  const results = []
  // Each item reads current facts independently; no giant write transaction,
  // background job, throttle override, automatic import or publication.
  for (const identity of identities) {
    try { results.push({ identity, status: 'CHECKED' as const, result: await libraryPreflight(actor, identity.instrumentKey, identity.instrumentVersion) }) }
    catch (error) {
      if (error instanceof AdminPermissionError && error.statusCode === 403) throw error
      results.push({ identity, status: 'FAILED' as const, error: error instanceof AdminPermissionError ? error.message : '预检读取失败，请稍后仅重试该版本' })
    }
  }
  return { readOnly: true as const, results, writes: 0 as const }
}
