import { describe, expect, it } from 'vitest'
import { hashDeclarativePackage, parseDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'

const fixture = (): any => ({
  schemaVersion: 1,
  manifest: {
    definition: {
      schemaVersion: 1, bundleKey: 'unknown_package', bundleVersion: '1.0.0', status: 'DRAFT', category: 'integrated', name: 'Example', description: 'Fixture only',
      respondentTypes: ['SELF'], initiationModes: ['STUDENT_COURSE'], population: { subjectPopulation: 'unspecified' },
      slots: [{ slotKey: 'source', unitType: 'SCALE', position: 0, required: true, instrumentKey: 'unknown_scale', instrumentVersion: '1.0.0', respondentType: 'SELF', valueSelectors: ['total'] }],
      engine: { key: 'declarative-evidence-v1', version: '1.0.0' }, contextDefinitionKey: null, contextDefinitionVersion: null,
      reportDefinitionKey: 'example_report', reportDefinitionVersion: '1.0.0',
      publicationRequirements: { scientificGate: true, rightsGate: true, languageGate: true, reportGate: true, safetyGate: false, nonCommercialOnly: false },
      rightsRequirements: { required: false, instrumentKeys: [] }, safetyCapability: { safetyCapable: false, productionTriggerEnabled: false }, limitations: ['Fixture only'],
    },
    files: { evidence: 'evidence-map.json', rules: 'rules.json', report: 'report.json', scientific: 'scientific.json', publication: 'publication.json' }, cognitiveDependencies: [],
  },
  evidence: [{ evidenceKey: 'score', slotKey: 'source', selector: 'total', valueType: 'number', unit: 'points', construct: 'description', role: 'PRIMARY', direction: 'neutral', qualityPolicy: 'interpretable_only' }],
  rules: { version: '1.0.0', items: [{ ruleId: 'observed', when: { op: 'gte', evidenceKey: 'score', value: 1 }, kind: 'independent_summary', text: 'Observed value', evidenceKeys: ['score'], supportRefs: [] }] },
  report: { key: 'example_report', version: '1.0.0', locale: 'en', blocks: [{ blockId: 'summary', kind: 'conclusions', title: 'Summary', audience: ['student'], ruleIds: ['observed'] }], states: { missing: 'Missing', limited: 'Limited', unavailable: 'Unavailable' } },
  scientific: { maturity: 'EXPERIMENTAL', scope: 'Fixture only', references: [] }, publication: { requestedStatus: 'DRAFT' },
})
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
