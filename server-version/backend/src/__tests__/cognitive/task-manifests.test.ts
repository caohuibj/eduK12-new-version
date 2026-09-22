import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import identities from '../../modules/cognitive/generated/identities.json'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { listCatalogTestTypes } from '../../modules/cognitive/library/catalog'
const require = createRequire(import.meta.url)
const { discover, generate } = require('../../../../scripts/cognitive/manifests.cjs')
const { guard } = require('../../../../scripts/cognitive/dependencies.cjs')
const key = (v: { testType: string; engineVersion: string; scoringVersion: string }) => `${v.testType}/${v.engineVersion}/${v.scoringVersion}`

// These tests parse the entire cross-tree package graph, not a single unit.
describe('task package projections', { timeout: 30_000 }, () => {
  it('has no drift and preserves declared exact identities and engine parity', () => {
    generate({ check: true })
    expect(listCognitiveRegistryEntries().map(key)).toEqual(identities.identities.map(key))
    expect([...new Set(identities.identities.map(i=>`${i.testType}/${i.engineVersion}`))].sort()).toEqual(identities.runners.map(i=>`${i.testType}/${i.engineVersion}`).sort())
    expect(listCatalogTestTypes().sort()).toEqual(discover().filter((p: { catalogFile: string | null })=>p.catalogFile).map((p: { task: string })=>p.task).sort())
    for(const seed of COGNITIVE_SEEDS) expect(identities.identities.map(key)).toContain(key(seed))
  })
  it('checks actual execution and runner import graphs', () => {
    expect(guard()).toBeGreaterThan(0)
  })
  it('binds descriptor indices to actual task exports, including seed counts', async () => {
    for(const p of discover()) {
      const execution = await import(resolve('../..',p.directory,'package.ts'))
      expect(execution.executionEntries.map(key)).toEqual(p.identities.map(key))
      const seeds = await import(resolve('../..',p.directory,'seeds.ts'))
      expect(seeds.seeds).toHaveLength(p.seeds.orders.length)
      expect(seeds.seeds.every((s: { testType: string })=>s.testType===p.task)).toBe(true)
    }
  })
})
