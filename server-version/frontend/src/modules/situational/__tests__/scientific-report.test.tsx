import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import SituationalReportCard from '../../reporting/SituationalReportCard'
afterEach(cleanup)
it.each(['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE'] as const)('displays frozen %s and its declared scope', scientificMaturity => {
  render(<SituationalReportCard report={{ itemId: 'test', type: 'SITUATIONAL', kind: 'situational', label: 'SJT', metrics: [], scientificContext: { scientificMaturity, governanceRevision: 4, evidenceDigest: 'a'.repeat(64), scope: { language: 'zh-CN', population: 'adult volunteers', use: 'research', claim: 'task association' }, provenance: 'FROZEN' } }} />)
  expect(screen.getByText(`测评时科研等级：${scientificMaturity} · 治理修订 4`)).toBeInTheDocument()
  expect(screen.getByText(/adult volunteers/)).toBeInTheDocument()
})
it('marks missing historical scientific snapshots explicitly', () => {
  render(<SituationalReportCard report={{ itemId: 'test', type: 'SITUATIONAL', kind: 'situational', label: 'SJT', metrics: [] }} />)
  expect(screen.getByText('测评时科研等级：PILOT（历史科研快照缺失）')).toBeInTheDocument()
})
