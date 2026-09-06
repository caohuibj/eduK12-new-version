import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  deriveCatalogDomainSummary,
  getCatalogEntry,
  listCatalogTestTypes,
  listProductCatalogEntries,
  requireCatalogForIdentity,
  resolveCatalogForIdentity,
  validateCatalogIntegrity,
} from '../../modules/cognitive/library/catalog'
import {
  deriveCognitiveScoringContract,
  getResearchCaptureDeclaration,
  getScoringContractDeclaration,
  listResearchCaptureDeclarations,
  listScoringContractDeclarations,
} from '../../modules/cognitive/library/dual-contracts'
import { projectCatalogForAudience } from '../../modules/cognitive/library/audience-projection'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { listCognitiveEvidenceMappingsForTask } from '../../modules/cognitive-analysis/evidence-mapping.registry'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'

const LIBRARY_DIR = path.resolve(__dirname, '../../modules/cognitive/library')
const SRC_DIR = path.resolve(__dirname, '../../..')

const readLibrarySource = (): string =>
  fs
    .readdirSync(LIBRARY_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => fs.readFileSync(path.join(LIBRARY_DIR, file), 'utf8'))
    .join('\n')

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      out.push(...collectSourceFiles(full))
    } else if (entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

const realRegistryEntries = listCognitiveRegistryEntries().filter(
  (entry) => entry.testType !== 'fake',
)

describe('cognitive library catalog identity', () => {
  it('covers exactly the 24 real tasks and excludes fake', () => {
    expect(listCatalogTestTypes()).toHaveLength(24)
    expect(listCatalogTestTypes()).not.toContain('fake')
    expect(getCatalogEntry('fake')).toBeUndefined()
  })

  it('passes build-time integrity validation (no duplicate / orphan / invalid identity)', () => {
    expect(() => validateCatalogIntegrity()).not.toThrow()
  })

  it('resolves every real registry entry through testType + engineVersion + scoringVersion', () => {
    expect(realRegistryEntries.length).toBe(27)
    for (const entry of realRegistryEntries) {
      const resolved = resolveCatalogForIdentity(
        entry.testType,
        entry.engineVersion,
        entry.scoringVersion,
      )
      expect(resolved).toBeDefined()
      expect(resolved?.registry.testType).toBe(entry.testType)
      expect(resolved?.registry.scoringVersion).toBe(entry.scoringVersion)
      expect(() =>
        requireCatalogForIdentity(entry.testType, entry.engineVersion, entry.scoringVersion),
      ).not.toThrow()
    }
  })

  it('rejects unknown identities', () => {
    expect(resolveCatalogForIdentity('fake', '1.0.0', '1.0.0')).toBeUndefined()
    expect(resolveCatalogForIdentity('nonexistent', '1.0.0', '1.0.0')).toBeUndefined()
    expect(() => requireCatalogForIdentity('reaction', '9.9.9', '9.9.9')).toThrow()
  })
})

describe('catalog single-source-of-truth boundaries', () => {
  it('catalog entries carry only catalog-owned metadata (no second domain/metric/publication/reference truth)', () => {
    const allowedKeys = new Set([
      'testType',
      'educationalPurpose',
      'plainAbilityHint',
      'interactionFamily',
      'rtSensitivity',
      'fineMotorSensitivity',
      'scientificStatus',
      'adminScientificNotes',
      'knownLimitations',
      'sourceNotes',
      'rightsProvenance',
    ])
    for (const entry of listProductCatalogEntries()) {
      for (const key of Object.keys(entry)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
    }
  })

  it('derives domain summary exclusively from the authoritative evidence mapping', () => {
    // reaction 1.1.0：与 evidence-mapping 的 domain/facet 完全一致
    const reactionSummary = deriveCatalogDomainSummary('reaction', '1.0.0', '1.1.0')
    const reactionMappings = listCognitiveEvidenceMappingsForTask('reaction', '1.0.0', '1.1.0')
    expect(reactionSummary.length).toBeGreaterThan(0)
    const reactionDomains = reactionSummary.map((summary) => summary.domain).sort()
    expect(reactionDomains).toEqual([...new Set(reactionMappings.map((m) => m.domain))].sort())

    // 六个 standalone 任务无映射 → 空 domain 摘要（允许单任务报告，不强行改 taxonomy）
    for (const testType of ['trailmaking', 'reversallearning', 'bart', 'wordlist', 'lexicaldecision', 'emotionrecognition']) {
      expect(deriveCatalogDomainSummary(testType, '1.0.0', '1.0.0')).toEqual([])
    }
  })

  it('scientificStatus only uses PILOT/RESEARCH_GRADE and is independent from publication', () => {
    for (const entry of listProductCatalogEntries()) {
      expect(['PILOT', 'RESEARCH_GRADE']).toContain(entry.scientificStatus)
      expect(entry.scientificStatus).toBe('PILOT')
    }
    // PUBLISHED + PILOT 共存是被允许的合法状态（9 个 v2 PUBLISHED 任务全部 PILOT）
    for (const entry of realRegistryEntries) {
      const definition = getCognitiveV2TaskDefinition(
        entry.testType,
        entry.engineVersion,
        entry.scoringVersion,
      )
      if (definition?.publication.status !== 'PUBLISHED') continue
      const catalog = getCatalogEntry(entry.testType)
      expect(catalog?.scientificStatus).toBe('PILOT')
    }
  })

  it('library module never imports publication or reference truth (no second reference status)', () => {
    const source = readLibrarySource()
    expect(source).not.toMatch(/from\s+['"].*v2\/registry/)
    expect(source).not.toMatch(/from\s+['"].*publication-gate/)
    expect(source).not.toMatch(/from\s+['"].*cognitive\/reference/)
    expect(source).not.toMatch(/from\s+['"].*reference-protocol/)
    expect(source).not.toContain('LITERATURE_DESCRIPTIVE')
    expect(source).not.toContain('SOURCE_REVIEWED')
  })

  it('catalog metadata is not imported by any runtime/scorer/hash path (hash stability by construction)', () => {
    const offenders = collectSourceFiles(SRC_DIR).filter((file) => {
      if (file.startsWith(LIBRARY_DIR)) return false
      const content = fs.readFileSync(file, 'utf8')
      return /from\s+['"][^'"]*cognitive\/library/.test(content)
    })
    expect(offenders).toEqual([])
  })
})

describe('dual contract declarations', () => {
  it('every catalog task has both declarations and no declaration exists for fake', () => {
    expect(listScoringContractDeclarations()).toHaveLength(24)
    expect(listResearchCaptureDeclarations()).toHaveLength(24)
    expect(getScoringContractDeclaration('fake')).toBeUndefined()
    expect(getResearchCaptureDeclaration('fake')).toBeUndefined()
  })

  it('derives a valid scoring contract for every real registry version', () => {
    for (const entry of realRegistryEntries) {
      const contract = deriveCognitiveScoringContract(
        entry.testType,
        entry.engineVersion,
        entry.scoringVersion,
      )
      expect(contract.headlineMetricKey === null || typeof contract.headlineMetricKey === 'string').toBe(true)
      if (entry.reportDefinition.headlineMetric) {
        expect(contract.headlineMetricKey).toBe(entry.reportDefinition.headlineMetric)
      }
      expect(contract.primaryMetricKeys).toEqual([...entry.reportDefinition.primaryMetrics])
      expect(contract.secondaryMetricKeys).toEqual([...entry.reportDefinition.secondaryMetrics])
      expect(contract.qualityKeys).toEqual(Object.keys(entry.qualityDefinitions))
      const metricKeys = new Set(Object.keys(entry.metricDefinitions))
      for (const key of contract.referenceEligibleMetricKeys) {
        expect(metricKeys.has(key)).toBe(true)
      }
    }
  })

  it('bundleEligible keys come only from the authoritative evidence mapping', () => {
    const mapped = deriveCognitiveScoringContract('reaction', '1.0.0', '1.1.0')
    const expected = [
      ...new Set(
        listCognitiveEvidenceMappingsForTask('reaction', '1.0.0', '1.1.0').map((m) => m.metricKey),
      ),
    ]
    expect(mapped.bundleEligibleMetricKeys).toEqual(expected)

    for (const testType of ['trailmaking', 'reversallearning', 'bart', 'wordlist', 'lexicaldecision', 'emotionrecognition']) {
      const standalone = deriveCognitiveScoringContract(testType, '1.0.0', '1.0.0')
      expect(standalone.bundleEligibleMetricKeys).toEqual([])
    }
  })
})

describe('audience projection contract', () => {
  it('student/parent view contains product info only (no domain/metric/version detail)', () => {
    const view = projectCatalogForAudience('student', {
      testType: 'stroop',
      engineVersion: '1.0.0',
      scoringVersion: '1.1.0',
      profile: 'standard',
    })
    expect(view.displayName).toBe('色词 Stroop')
    expect(view.isPilot).toBe(true)
    expect(view.estimatedMinutes).toEqual([4, 5])
    expect(Object.keys(view)).not.toContain('domainSummary')
    expect(Object.keys(view)).not.toContain('identity')
    expect(Object.keys(view)).not.toContain('keyMetricLabels')
    expect(JSON.stringify(view)).not.toContain('scoringVersion')
  })

  it('teacher view adds authoritative domain/facet, metric labels, and caller-provided reference summary', () => {
    const view = projectCatalogForAudience('teacher', {
      testType: 'reaction',
      engineVersion: '1.0.0',
      scoringVersion: '1.1.0',
      profile: 'standard',
      referenceSummary: { label: '试行参考', available: false },
    })
    expect(view.domainSummary.length).toBeGreaterThan(0)
    expect(view.domainSummary[0].domain).toBe('processing_speed')
    expect(view.keyMetricLabels).toContain('中位反应时')
    expect(view.referenceSummary).toEqual({ label: '试行参考', available: false })
    expect(view.interpretiveBoundary).toContain('不是')
  })

  it('admin view exposes full provenance and scientific status', () => {
    const view = projectCatalogForAudience('admin', {
      testType: 'trailmaking',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
    expect(view.identity).toMatchObject({
      testType: 'trailmaking',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
    expect(view.scientificStatus).toBe('PILOT')
    expect(view.rtSensitivity).toBe('moderate')
    expect(view.fineMotorSensitivity).toBe('high')
    expect(view.rightsProvenance).toContain('internal')
    expect(view.profileEstimatedMinutes.standard).toEqual([5, 7])
  })
})
