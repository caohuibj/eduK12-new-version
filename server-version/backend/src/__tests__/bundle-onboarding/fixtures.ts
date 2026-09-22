export const authoringFixture = (): any => ({
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
  fixtures:Object.fromEntries(['valid','missing','invalid','not-applicable'].map(name=>[name,{values:{score:name==='valid'?{state:'present',value:1}:{state:name==='not-applicable'?'not_applicable':name}},expectedRuleIds:name==='valid'?['observed']:[],expectedKind:'COMPUTED'}])),
  scientific: { maturity: 'EXPERIMENTAL', scope: 'Fixture only', references: [] }, publication: { requestedStatus: 'DRAFT' },
})
