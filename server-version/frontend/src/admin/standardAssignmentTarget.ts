export type StandardAssignmentTarget = { toolKey: string; releaseId: string }

export function readStandardAssignmentTarget(search: string): StandardAssignmentTarget | null {
  const values = new URLSearchParams(search)
  const toolKey = values.get('standardTool')?.trim()
  const releaseId = values.get('standardRelease')
  if (!toolKey || toolKey.length > 150 || !releaseId || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(releaseId)) return null
  return { toolKey, releaseId }
}

export function standardAssignmentSearch(target: StandardAssignmentTarget): string {
  return '?' + new URLSearchParams({ standardTool: target.toolKey, standardRelease: target.releaseId })
}
