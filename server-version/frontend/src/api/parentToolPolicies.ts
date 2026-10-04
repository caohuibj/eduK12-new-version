import apiClient from './client'
export interface ToolRef {
  family: 'SCALE' | 'FORM' | 'BUNDLE' | 'COGNITIVE' | 'SITUATIONAL'
  key: string
  version: string
}
export interface ToolPolicy {
  mode: 'NONE' | 'COMPLETION_ONLY' | 'INDIVIDUAL_SUMMARY'
  metricKeys: string[]
  longitudinalMetricKeys: string[]
}
export interface PolicySnapshot {
  tool: ToolRef
  version: number
  policy: ToolPolicy
  commandKey: string
  allowedActions: string[]
}
const path = (ref: ToolRef) =>
  `/parent-tool-policies/${ref.family}/${encodeURIComponent(ref.key)}/${encodeURIComponent(ref.version)}`
export const parentToolPoliciesApi = {
  async read(ref: ToolRef, signal?: AbortSignal) {
    const r = await apiClient.get<PolicySnapshot>(path(ref), { signal })
    if (r.code !== 0 || !r.data)
      throw new Error(r.message || '披露设置读取失败')
    return r.data
  },
  async save(snapshot: PolicySnapshot, policy: ToolPolicy) {
    const r = await apiClient.put(path(snapshot.tool), {
      policy,
      expectedVersion: snapshot.version,
      commandKey: snapshot.commandKey,
    })
    if (r.code !== 0) throw new Error(r.message || '披露设置保存失败')
    return r.data
  },
}
