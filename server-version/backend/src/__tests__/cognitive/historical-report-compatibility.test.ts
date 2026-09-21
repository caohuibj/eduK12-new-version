import { describe, expect, it } from 'vitest'
import baseline from './fixtures/task-report-baseline.json'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import type { CognitiveProfile } from '../../modules/cognitive/cognitive.types'
import type { FrozenReportSnapshot } from '../../modules/cognitive/profile-freeze'
import { reportDigests } from './report-compatibility-capture'

describe('historical reports captured independently from base 01f5a46',()=>{
 it('preserves all profiles, both report projections, quality states and pre-snapshot fallback',()=>{
  for(const sample of baseline.samples){
    const entry=requireCognitiveRegistryEntry(sample.testType,sample.engineVersion,sample.scoringVersion)
    expect(reportDigests(entry,sample.profile as CognitiveProfile,sample.frozen as unknown as FrozenReportSnapshot)).toEqual(sample.withSnapshot)
    expect(reportDigests(entry,sample.profile as CognitiveProfile,null)).toEqual(sample.withoutSnapshot)
  }
 })
})
