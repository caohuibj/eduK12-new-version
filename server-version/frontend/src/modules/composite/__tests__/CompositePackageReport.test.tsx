import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompositePackageReport from '../CompositePackageReport'

describe('CompositePackageReport', () => {
  it('renders safe participant domains without raw JSON or overall scores', () => {
    render(<CompositePackageReport report={{
      audience: 'participant',
      packageName: '注意稳定性报告包',
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      profile: 'research',
      qualitySummary: { interpretableModules: 1, excludedModules: [], warnings: [] },
      cognitiveDomains: [{
        domain: 'sustained_attention',
        label: '持续注意与稳定性',
        status: 'descriptive_only',
        consistency: 'not_applicable',
        summary: '仅作任务表现描述。',
        caveats: [],
        facetCoverage: [{ facet: 'response_stability', evidenceCount: 1, interpretable: true, directionClasses: ['unknown'] }],
      }],
      recommendations: [],
      limitations: ['不作诊断。'],
    }} />)

    expect(screen.getByText('注意稳定性报告包')).toBeTruthy()
    expect(screen.getByTestId('composite-domain-sustained_attention')).toBeTruthy()
    expect(screen.getByText('response_stability · 1')).toBeTruthy()
    expect(screen.queryByText(/overallScore|percentile|雷达/)).toBeNull()
    expect(screen.queryByText(/"metrics"/)).toBeNull()
  })

  it('derives researcher facet coverage without rendering Evidence values', () => {
    render(<CompositePackageReport report={{
      audience: 'researcher',
      packageName: '研究报告包',
      packageKey: 'research-package',
      packageVersion: '1.0.0',
      profile: 'research',
      qualitySummary: { interpretableModules: 1, excludedModules: [], warnings: [] },
      cognitiveDomains: [{
        domain: 'sustained_attention',
        label: '持续注意与稳定性',
        status: 'interpretable',
        consistency: 'consistent',
        summary: '存在方向性证据。',
        caveats: [],
        evidence: [{ facet: 'response_stability', evidenceCount: 1, interpretable: true, value: 123, directionClass: 'more_strength' }],
      }],
      recommendations: [],
      limitations: [],
      snapshotId: 'snapshot-1',
      snapshotCreatedAt: '2026-01-01T00:00:00Z',
      generationReason: 'COMPLETION',
      analysisDefinitionVersion: '1.0.0',
      analysisProtocolKey: 'research-package',
      analysisProtocolVersion: '1.0.0',
      analysisVersion: 'analysis-1',
      reportSchemaVersion: 'schema-1',
      inputFingerprint: 'f'.repeat(64),
      evidence: [],
      crossSourceFindings: [],
      provenance: {},
    }} />)

    expect(screen.getByText('response_stability · 1')).toBeTruthy()
    expect(screen.queryByText('123')).toBeNull()
  })
})
