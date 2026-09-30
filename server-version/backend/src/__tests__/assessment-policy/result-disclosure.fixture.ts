import { resultAudiences, type ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
export function testDisclosure(minimumRespondents: number | null = null): ResultDisclosureContractV1 {
  return { schemaVersion: 1, policyKey: 'fixture:explicit-disclosure', minimumRespondents,
    audiences: Object.fromEntries(resultAudiences.map(a => [a, { mode: 'NONE', metricKeys: [], longitudinalMetricKeys: [] }])) as ResultDisclosureContractV1['audiences'] }
}
