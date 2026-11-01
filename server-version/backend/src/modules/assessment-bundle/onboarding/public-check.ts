import type { DeclarativePackage } from './contract'
import { dependencyBlockers } from './dependencies'

// These public DRAFT declarations intentionally omit the private CHEXI text.
// This applies only to code-build checks, never installation or publication.
const privateDraftSlots: Record<string, readonly string[]> = {
  'child_chexi_parent_zh_cn_v1@0.1.0': ['chexi'],
  'child_chexi_teacher_zh_cn_v1@0.1.0': ['chexi'],
  'child_cognitive_control_parent_teacher_zh_cn@0.1.0': ['parent_chexi', 'teacher_chexi'],
  'child_cognitive_control_parent_zh_cn@0.1.0': ['parent_chexi'],
  'child_cognitive_control_teacher_zh_cn@0.1.0': ['teacher_chexi'],
}
export function publicDeclarationDependencies(pack: DeclarativePackage) {
  const d = pack.manifest.definition
  const allowed = d.status === 'DRAFT' && pack.publication.requestedStatus === 'DRAFT'
    ? privateDraftSlots[d.bundleKey + '@' + d.bundleVersion] ?? [] : []
  const deferred = new Set(d.slots.filter(slot => allowed.includes(slot.slotKey)
    && slot.unitType === 'SCALE' && slot.instrumentKey === 'chexi_zh_hans'
    && slot.instrumentVersion === '1.0.0').map(slot => slot.slotKey + ': unknown SCALE identity'))
  const errors = dependencyBlockers(pack)
  return { blockers: errors.filter(error => !deferred.has(error)),
    unavailablePrivateSources: errors.filter(error => deferred.has(error)) }
}
