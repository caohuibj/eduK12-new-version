export interface CognitiveFrontendMetricPresentationV1 {
  label?: string
  explanation?: string
}

export interface CognitiveFrontendParticipantPresentationV1 {
  schemaVersion: 1
  version: string
  metricCopy: Record<string, CognitiveFrontendMetricPresentationV1>
}
