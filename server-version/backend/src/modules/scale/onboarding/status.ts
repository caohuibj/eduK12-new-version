import { Prisma, type PrismaClient } from '@prisma/client'
import { readToolPolicies } from '../../assessment-governance/tool-entry-policy'
import { getScaleInstrumentSource, listScaleInstrumentSources } from './instrument-registry'
import { previewScaleInstrument } from './preview'
import { scaleSourcePolicyIdentity } from './source-snapshot'
import { localizationNextActions } from '../policy/localization'
import { readActiveScaleDeployment } from '../deployment/repository'
import { evaluateScaleSourceScientificQualification } from '../library/scientific-qualification'
import { qualificationAllowsScientificMaturity } from '../../assessment-governance/scientific-qualification'

type Db = PrismaClient | Prisma.TransactionClient

/** Product-admission next actions for blocker codes produced outside the
 * localization module. */
const admissionNextActions: Record<string, { stage: string; owner: string; next: string }> = {
  SYSTEM_ADMIN_REQUIRED: { stage: '发布操作', owner: '平台管理员', next: '由未冻结的 SYSTEM_ADMIN 账号执行发布' },
  EXECUTABLE_SOURCE_MISSING: { stage: '内容导入', owner: '内容线', next: '该精确版本未注册可执行内容，先完成源码导入' },
  EXECUTABLE_NOT_PUBLISHED: { stage: '内容导入', owner: '内容线', next: '可执行内容 releaseStatus 未到 PUBLISHED，完成技术验证后升级' },
  SCIENTIFIC_CLAIM_NOT_QUALIFIED: { stage: '科学适用性审核', owner: '科学审核人', next: '证据不足以支撑声明的科学成熟度，补证据或下调成熟度声明' },
  SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH: { stage: '科学适用性审核', owner: '科学审核人', next: 'scientificReview.territory 与部署 territory 不一致，重新界定适用范围' },
  DEPLOYMENT_MODES_MISSING: { stage: '部署策略', owner: '平台管理员', next: '安装部署策略必须声明 deploymentModes' },
  PRODUCT_NOT_READY: { stage: '产品就绪检查', owner: '平台管理员', next: '按 product-readiness 检查表补齐缺失项' },
  SCALE_NOT_INSTALLED: { stage: '安装', owner: '平台管理员', next: '先执行 install（物化内容+部署策略），再发布' },
  DEPLOYMENT_BINDING_MISSING: { stage: '安装', owner: '平台管理员', next: '没有 ACTIVE 部署策略；先完成安装' },
  SCALE_DEFINITION_CONFLICT: { stage: '内容一致性', owner: '内容线', next: '库内量表与源码定义哈希不一致，核查导入是否被手工改动' },
  REFERENCES_NOT_INSTALLED: { stage: '参数安装', owner: '平台管理员', next: '存在尚未安装的 reference set，先重跑安装' },
  PUBLICATION_PREVIEW_STALE: { stage: '发布操作', owner: '平台管理员', next: '预览后内容已变化，用新 proofHash 重新确认发布' },
}

const blockerNextAction = (code: string): { stage: string; owner: string; next: string } | undefined =>
  localizationNextActions[code] ?? admissionNextActions[code]

export interface StandardOnboardingEntry {
  scaleId: string | null
  instrumentKey: string
  name: string
  instrumentVersion: string
  measurementReleaseId: string | null
  runtimePolicyHash: string | null
  /** Distinct lifecycle states; 已导入 must never read as 已上线. */
  states: {
    imported: boolean
    localizationReview: string
    expertReview: string
    scientificMaturity: string | null
    scientificQualified: boolean
    deployed: boolean
    published: boolean
    visible: boolean
    trainingEntry: string
    surveyEntry: string
    trainingEntryPaused: boolean
    surveyEntryPaused: boolean
  }
  stage: string
  allowActivation: boolean
  blockers: string[]
  nextActions: Array<{ code: string; stage: string; owner: string; next: string }>
}

/** One governance view per registered standard instrument version. States stay
 * separate (translation review / expert review / scientific maturity /
 * deployment / publication / product entry); the page explains where each
 * blocker lives and what the next action is. */
export const listStandardOnboardingStatus = async (db: Db): Promise<{ list: StandardOnboardingEntry[] }> => {
  type Row = { id: string | null; code: string; name: string; instrument_version: string; status: string; visibility: string; measurement_release_id: string | null }
  const installed = await db.$queryRaw<Row[]>(
    Prisma.sql`SELECT id, code, name, instrument_version, status::text, visibility::text, measurement_release_id FROM scales WHERE instrument_class='STANDARD' ORDER BY code, instrument_version`)
  // Pending translations cannot be installed yet. They still need a row in the
  // governance view; an installed-only query hides precisely those blockers.
  const byVersion = new Map(installed.map(row => [JSON.stringify([row.code, row.instrument_version]), row]))
  for (const source of listScaleInstrumentSources()) {
    const key = JSON.stringify([source.identity.instrumentKey, source.identity.instrumentVersion])
    if (!byVersion.has(key)) byVersion.set(key, {
      id: null, code: source.identity.instrumentKey, instrument_version: source.identity.instrumentVersion,
      name: source.catalog.identity.canonicalName, status: 'NOT_INSTALLED', visibility: 'HIDDEN', measurement_release_id: null,
    })
  }
  const rows = [...byVersion.values()].sort((a, b) => a.code.localeCompare(b.code) || a.instrument_version.localeCompare(b.instrument_version))
  const deployments = new Map<string, Awaited<ReturnType<typeof readActiveScaleDeployment>>>()
  for (const row of rows) if (row.id) deployments.set(row.id, await readActiveScaleDeployment(db, row.id))
  const identities = rows.flatMap(row => {
    const source = getScaleInstrumentSource(row.code, row.instrument_version)
    return source ? [scaleSourcePolicyIdentity(source)] : []
  })
  const trainingPolicies = await readToolPolicies(db, identities, 'TRAINING')
  const surveyPolicies = await readToolPolicies(db, identities, 'SURVEY')
  const list = rows.map(row => {
    const source = getScaleInstrumentSource(row.code, row.instrument_version)
    const deployment = row.id ? deployments.get(row.id) ?? null : null
    const preview = source ? previewScaleInstrument({
      source,
      locale: deployment?.policy.locale ?? source.localization?.targetLocale ?? 'zh-CN',
      territory: deployment?.policy.territory ?? source.scientificReview?.territory ?? 'CN',
      deploymentModes: deployment?.policy.deploymentModes ?? ['STANDALONE'],
    }) : null
    const identity = source ? scaleSourcePolicyIdentity(source) : null
    const policyFor = (product: 'TRAINING' | 'SURVEY') => {
      if (!identity) return undefined
      return (product === 'TRAINING' ? trainingPolicies : surveyPolicies).get(identity.resourceKey + ':' + identity.fingerprint)
    }
    const qualification = source ? evaluateScaleSourceScientificQualification(source) : null
    const blockers = [...new Set([
      ...(preview?.blockers ?? ['EXECUTABLE_SOURCE_MISSING']),
      ...(!row.id ? ['SCALE_NOT_INSTALLED'] : !deployment ? ['DEPLOYMENT_BINDING_MISSING'] : []),
    ])]
    const trainingPolicy = policyFor('TRAINING'), surveyPolicy = policyFor('SURVEY')
    const states = {
      imported: Boolean(source?.executable),
      localizationReview: source?.localization?.reviewStatus ?? 'LOCALIZATION_MISSING',
      expertReview: source?.localization?.expertReviewStatus ?? 'NOT_ESTABLISHED',
      scientificMaturity: source?.catalog.scientificMaturity ?? null,
      scientificQualified: Boolean(source && qualification && qualificationAllowsScientificMaturity(source.catalog.scientificMaturity, qualification)),
      deployed: Boolean(deployment),
      published: row.status === 'PUBLISHED',
      visible: row.visibility !== 'HIDDEN',
      trainingEntry: trainingPolicy?.decision ?? 'PENDING',
      surveyEntry: surveyPolicy?.decision ?? 'PENDING',
      trainingEntryPaused: trainingPolicy?.paused ?? false,
      surveyEntryPaused: surveyPolicy?.paused ?? false,
    }
    return {
      scaleId: row.id, instrumentKey: row.code, name: row.name, instrumentVersion: row.instrument_version,
      measurementReleaseId: row.measurement_release_id,
      runtimePolicyHash: preview?.executable?.runtimePolicyHash ?? null,
      states,
      stage: states.published && states.visible ? '已发布'
        : states.published ? '已发布（隐藏）'
        : states.deployed ? '已配置部署（未发布）'
        : states.imported ? '已导入待部署'
        : '仅目录候选',
      allowActivation: Boolean(deployment && preview?.allowActivation),
      blockers,
      nextActions: blockers.flatMap(code => {
        const action = blockerNextAction(code)
        return action ? [{ code, ...action }] : []
      }),
    }
  })
  return { list }
}
