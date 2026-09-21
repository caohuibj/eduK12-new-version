/**
 * COG-P1 Commit 3 — Cognitive Library Catalog Registry + authoritative joins.
 *
 * 规则（Pilot-first v2 指令 §10 / §取消4）：
 *  - 为全部 24 个真实 task 建立 catalog identity binding；fake 不进入产品 catalog。
 *  - catalog 通过 testType + engineVersion + scoringVersion 经 cognitive.registry
 *    解析权威任务身份；不维护第二份任务真值。
 *  - Domain/Facet 只能从 cognitive-analysis/evidence-mapping.registry 派生；
 *    无映射的 task 允许 standalone（返回空 domain 摘要），不为发布改 taxonomy。
 *  - build-time 校验：duplicate / orphan / invalid identity 直接抛错（fail-fast）。
 */

import type { RegistryEntry } from '../cognitive.types'
import {
  getCognitiveRegistryEntry,
  listCognitiveRegistryEntries,
  listCognitiveRegistryEntriesForType,
} from '../cognitive.registry'
import { listCognitiveEvidenceMappingsForTask } from '../../cognitive-analysis/evidence-mapping.registry'
import {
  RESEARCH_GRADE_IDENTITIES as COGNITIVE_RESEARCH_GRADE_IDENTITIES,
  resolveCognitiveScientificMaturity,
} from './scientific-maturity'
import type {
  CognitiveLibraryCatalogEntry,
  CognitiveScientificStatus,
} from './catalog-contract'
import { COGNITIVE_TASK_TYPES } from '../tasks/task-packages'
import { COGNITIVE_CATALOG_BY_TEST_TYPE } from '../tasks/generated/catalog.generated'

const CATALOG: Record<string, CognitiveLibraryCatalogEntry> = { ...COGNITIVE_CATALOG_BY_TEST_TYPE }


/** catalog 身份键重复在 Record 层面不可能；此处断言防止将来改为数组/多键结构时退化。 */
const CATALOG_TEST_TYPES = Object.keys(CATALOG)
if (new Set(CATALOG_TEST_TYPES).size !== CATALOG_TEST_TYPES.length) {
  throw new Error('Duplicate cognitive library catalog testType')
}
if (CATALOG_TEST_TYPES.includes('fake')) {
  throw new Error('fake must not appear in the product cognitive library catalog')
}

/** build-time 校验：catalog 与 registry 身份必须互相对应（fail-fast）。 */
export const validateCatalogIntegrity = (): void => {
  const generatedProductTypes = COGNITIVE_TASK_TYPES.filter((testType) => testType !== 'fake')
  if (
    generatedProductTypes.length !== CATALOG_TEST_TYPES.length
    || generatedProductTypes.some((testType) => !CATALOG[testType])
  ) {
    throw new Error('Generated Cognitive task projection does not match product catalog')
  }
  for (const testType of CATALOG_TEST_TYPES) {
    if (listCognitiveRegistryEntriesForType(testType).length === 0) {
      throw new Error(`Cognitive library catalog entry has no registry identity: ${testType}`)
    }
  }
  for (const entry of listAllRegistryTestTypes()) {
    if (entry === 'fake') continue
    if (!CATALOG[entry]) {
      throw new Error(`Orphan cognitive registry task without catalog entry: ${entry}`)
    }
  }
}

const listAllRegistryTestTypes = (): string[] => {
  const all = new Set<string>()
  for (const registryEntry of listCognitiveRegistryEntries()) all.add(registryEntry.testType)
  return [...all]
}

validateCatalogIntegrity()

export const listCatalogTestTypes = (): string[] => [...CATALOG_TEST_TYPES]

export const getCatalogEntry = (testType: string): CognitiveLibraryCatalogEntry | undefined =>
  CATALOG[testType]

/** 全部 24 个真实任务的 catalog 条目（fake 天然不在内）。 */
export const listProductCatalogEntries = (): CognitiveLibraryCatalogEntry[] =>
  CATALOG_TEST_TYPES.map((testType) => CATALOG[testType])

/**
 * 权威身份 join：catalog 条目必须经 cognitive.registry 的
 * testType + engineVersion + scoringVersion 定位到具体 registry entry。
 */
export const resolveCatalogForIdentity = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): { catalog: CognitiveLibraryCatalogEntry; registry: RegistryEntry<unknown, unknown> } | undefined => {
  const catalog = CATALOG[testType]
  const registry = getCognitiveRegistryEntry(testType, engineVersion, scoringVersion)
  if (!catalog || !registry) return undefined
  return { catalog, registry }
}

export const requireCatalogForIdentity = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): { catalog: CognitiveLibraryCatalogEntry; registry: RegistryEntry<unknown, unknown> } => {
  const resolved = resolveCatalogForIdentity(testType, engineVersion, scoringVersion)
  if (!resolved) {
    throw new Error(
      `No cognitive library catalog identity for ${testType}/${engineVersion}/${scoringVersion}`,
    )
  }
  return resolved
}

/**
 * @deprecated Compatibility view for catalog-era callers. It owns no state;
 * add/delete/has operate on COGNITIVE_SCIENTIFIC_MATURITY_BY_IDENTITY.
 */
export const RESEARCH_GRADE_IDENTITIES = COGNITIVE_RESEARCH_GRADE_IDENTITIES

/**
 * @deprecated Compatibility resolver. Scientific maturity is now owned by
 * scientific-maturity.ts and remains exact-identity scoped.
 */
export const resolveScientificStatus = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveScientificStatus => {
  requireCatalogForIdentity(testType, engineVersion, scoringVersion)
  return resolveCognitiveScientificMaturity(testType, engineVersion, scoringVersion)
}

export interface CognitiveCatalogDomainFacetSummary {
  domain: string
  facets: Array<{
    facet: string
    primaryMetricKeys: string[]
    supportingMetricKeys: string[]
  }>
}

/**
 * Domain/Facet 摘要：只能由 evidence-mapping.registry 派生（§取消4）。
 * 无映射任务（standalone）返回 []，允许单任务报告 / Pilot Reference，
 * 暂不加入 domain aggregation。
 */
export const deriveCatalogDomainSummary = (
  testType: string,
  engineVersion: string,
  scoringVersion: string,
): CognitiveCatalogDomainFacetSummary[] => {
  const mappings = listCognitiveEvidenceMappingsForTask(testType, engineVersion, scoringVersion)
  const byDomain = new Map<string, CognitiveCatalogDomainFacetSummary>()
  for (const mapping of mappings) {
    let summary = byDomain.get(mapping.domain)
    if (!summary) {
      summary = { domain: mapping.domain, facets: [] }
      byDomain.set(mapping.domain, summary)
    }
    let facet = summary.facets.find((candidate) => candidate.facet === mapping.facet)
    if (!facet) {
      facet = { facet: mapping.facet, primaryMetricKeys: [], supportingMetricKeys: [] }
      summary.facets.push(facet)
    }
    if (mapping.role === 'primary') facet.primaryMetricKeys.push(mapping.metricKey)
    else facet.supportingMetricKeys.push(mapping.metricKey)
  }
  return [...byDomain.values()]
}

export type { CognitiveScientificStatus }
