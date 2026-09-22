import { describe, expect, it } from 'vitest'
import { hashDeclarativePackage, parseDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'

import { authoringFixture as fixture } from './fixtures'
describe('declarative package authoring contract', () => {
  it('accepts unknown identities without authorizing release', () => {
    const input = fixture()
    input.publication.requestedStatus = 'PUBLISHED'
    expect(parseDeclarativePackage(input).manifest.definition.status).toBe('DRAFT')
  })
  it('canonicalizes object order and excludes only lifecycle request from content identity', () => {
    const input = fixture()
    const hash = hashDeclarativePackage(input)
    expect(hashDeclarativePackage(Object.fromEntries(Object.entries(input).reverse()))).toBe(hash)
    input.publication.requestedStatus = 'HOLD'
    expect(hashDeclarativePackage(input)).toBe(hash)
    input.rules.items[0].text = 'Changed'
    expect(hashDeclarativePackage(input)).not.toBe(hash)
  })
  it.each([
    ['version range', (p: any) => { p.manifest.definition.bundleVersion = '^1.0.0' }],
    ['unknown operator', (p: any) => { p.rules.items[0].when.op = 'eval' }],
    ['path traversal', (p: any) => { p.manifest.files.rules = '../rules.json' }],
    ['duplicate evidence', (p: any) => { p.evidence.push(p.evidence[0]) }],
    ['unknown selector', (p: any) => { p.evidence[0].selector = 'missing' }],
    ['unknown evidence', (p: any) => { p.rules.items[0].when.evidenceKey = 'missing' }],
    ['incorrect type', (p: any) => { p.rules.items[0].when.value = '1' }],
    ['missing provenance', (p: any) => { p.rules.items[0].evidenceKeys = ['missing'] }],
    ['missing report rule', (p: any) => { p.report.blocks[0].ruleIds = [] }],
    ['unsupported claim', (p: any) => { p.rules.items[0].kind = 'joint_conclusion' }],
    ['unknown block', (p: any) => { p.report.blocks[0].kind = 'html' }],
    ['untrusted approval flag', (p: any) => { p.publication.reviewed = true }],
    ['missing context', (p: any) => { p.manifest.definition.contextDefinitionKey = 'age' }],
    ['condition depth', (p: any) => { for (let i=0;i<10;i++) p.rules.items[0].when = { op: 'not', condition: p.rules.items[0].when } }],
    ['oversize input', (p: any) => { p.rules.items[0].text = 'x'.repeat(1024*1024) }],
  ])('rejects %s', (_name, mutate) => {
    const input = fixture(); mutate(input)
    expect(() => parseDeclarativePackage(input)).toThrow()
  })
  it('rejects accessors before executing them', () => {
    const input = fixture()
    let invoked = false
    Object.defineProperty(input, 'extra', { enumerable: true, get() { invoked=true; return 'bad' } })
    expect(() => parseDeclarativePackage(input)).toThrow('PACKAGE_JSON_ONLY')
    expect(invoked).toBe(false)
  })
})
