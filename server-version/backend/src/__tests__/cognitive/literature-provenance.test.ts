import { describe, expect, it } from 'vitest'
import { LITERATURE_REFERENCE_SETS, literatureSetIsEnabled } from '../../modules/cognitive/reference-data/literature/sets'

describe('literature reference provenance', () => {
  it('requires a provenance id, metric mapping, age range, and protocol coverage', () => {
    expect(LITERATURE_REFERENCE_SETS.length).toBeGreaterThan(0)
    for (const set of LITERATURE_REFERENCE_SETS) {
      expect(set.provenance.sourceId).toMatch(/\S/)
      expect(set.provenance.originalMetric).toMatch(/\S/)
      expect(set.provenance.systemMetric).toMatch(/\S/)
      expect(set.provenance.originalAgeRange).toMatch(/\S/)
      expect(set.provenance.protocol.testType).toBe(set.protocol.testType)
      expect(set.provenance.doi || set.sources[0]?.doi).toBeTruthy()
      expect(literatureSetIsEnabled(set)).toBe(false)
      expect(set.bands).toEqual([])
    }
  })

  it('does not treat a DOI-only note as an enabled literature set', () => {
    const stroop = LITERATURE_REFERENCE_SETS.find((set) => set.testType === 'stroop')
    expect(stroop?.sources[0]?.doi).toBe('10.1186/s40359-024-01844-0')
    expect(stroop?.enabled).toBe(false)
    expect(stroop?.provenance.comparable).toBe(false)
    expect(stroop?.provenance.originalN).toBe(55)
  })
})
