import { describe, expect, it } from 'vitest'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'
import {
  buildRutterDraftReferenceSet,
  deriveReactionRutterParticipantMetrics,
  parseCsvRecords,
  verifyRutterPaperSummary,
} from '../../scripts/research/reaction-rutter-2020-derivation'

describe('Reaction Rutter 2020 offline derivation', () => {
  it('parses quoted CSV with CRLF deterministically', () => {
    const rows = parseCsvRecords('age,median,icv,note\r\n10,300,0.3,"a,b"\r\n11,310,0.4,"quoted ""value"""\r\n')
    expect(rows).toEqual([
      { age: '10', median: '300', icv: '0.3', note: 'a,b' },
      { age: '11', median: '310', icv: '0.4', note: 'quoted "value"' },
    ])
  })

  it('derives participant and age summaries after explicit source filters', () => {
    const csv = [
      'age,median,icv,include',
      '10,280,0.20,yes',
      '10,300,0.30,yes',
      '11,320,0.40,yes',
      '11,340,0.50,yes',
      '11,999,9.99,no',
    ].join('\n')
    const result = deriveReactionRutterParticipantMetrics({
      csvText: csv,
      sourceFile: 'fixture.csv',
      mapping: { age: 'age', medianRtMs: 'median', rtICV: 'icv' },
      filters: [{ column: 'include', value: 'yes' }],
    })
    expect(result.selectedRows).toBe(4)
    expect(result.overall.medianRtMs).toMatchObject({ n: 4, mean: 310 })
    expect(result.overall.rtICV).toMatchObject({ n: 4, mean: 0.35 })
    expect(result.ageBins.map((bin) => [bin.ageYears, bin.medianRtMs.mean])).toEqual([[10, 290], [11, 330]])
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails the paper reproduction gate instead of minting evidence from mismatched data', () => {
    const derivation = deriveReactionRutterParticipantMetrics({
      csvText: 'age,median,icv\n10,300,0.3\n10,310,0.4\n',
      sourceFile: 'fixture.csv',
      mapping: { age: 'age', medianRtMs: 'median', rtICV: 'icv' },
    })
    const reproduction = verifyRutterPaperSummary(derivation, {
      participantN: 10,
      medianRtMs: { mean: 301, sd: 60, tolerance: 1 },
      rtICV: { mean: 0.33, sd: 0.17, tolerance: 0.01 },
    })
    expect(reproduction.pass).toBe(false)
    expect(reproduction.failures.length).toBeGreaterThan(0)
    expect(() => buildRutterDraftReferenceSet({
      derivation,
      reproduction,
      metrics: ['medianRtMs'],
    })).toThrow(/reproduction gate failed/i)
  })

  it('builds only an explicit DRAFT descriptive literature candidate after reproduction passes', () => {
    const csv = [
      'age,median,icv',
      '10,280,0.20',
      '10,300,0.30',
      '11,320,0.40',
      '11,340,0.50',
    ].join('\n')
    const derivation = deriveReactionRutterParticipantMetrics({
      csvText: csv,
      sourceFile: 'fixture.csv',
      mapping: { age: 'age', medianRtMs: 'median', rtICV: 'icv' },
    })
    const reproduction = verifyRutterPaperSummary(derivation, {
      participantN: 4,
      medianRtMs: {
        mean: derivation.overall.medianRtMs.mean!,
        sd: derivation.overall.medianRtMs.sd!,
        tolerance: 0,
      },
      rtICV: {
        mean: derivation.overall.rtICV.mean!,
        sd: derivation.overall.rtICV.sd!,
        tolerance: 0,
      },
    })
    expect(reproduction.pass).toBe(true)

    const candidate = buildRutterDraftReferenceSet({
      derivation,
      reproduction,
      metrics: ['medianRtMs'],
      minAgeYears: 10,
      maxAgeYears: 11,
      minimumAgeBinN: 2,
    })
    expect(candidate).toMatchObject({
      instrumentType: 'cognitive',
      instrumentKey: 'reaction',
      status: 'DRAFT',
    })
    expect(candidate.entries).toHaveLength(2)
    expect(candidate.entries.every((entry) => (
      entry.scoreKey === 'medianRtMs'
      && entry.referenceKind === 'descriptive_sample'
      && entry.evidenceLevel === 'literature_beta'
      && entry.provenanceType === 'literature_derived_estimate'
    ))).toBe(true)
    expect(validateReferenceSetDefinition(candidate).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })
})
