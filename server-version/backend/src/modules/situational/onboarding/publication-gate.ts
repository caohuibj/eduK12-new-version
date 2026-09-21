import { compileSituationRuntime } from '../../assessment-runtime/compiler'
import { validateSituationPackage } from '../situation-package'
import { deriveAuthoritativeSituationalTrajectory } from '../situation-trajectory'
import { instrumentSourceSchema, projectSituationPackage, publicationContentDigest } from './schema'

export interface OnboardingIssue { code: string; path: string; message: string }
export function evaluateSituationalPublicationGate(value: unknown) {
  const errors: OnboardingIssue[] = [], warnings: OnboardingIssue[] = []
  const parsed = instrumentSourceSchema.safeParse(value)
  if (!parsed.success) return { eligibleToPublish: false, errors: parsed.error.issues.map(i => ({ code: 'SOURCE_SCHEMA', path: i.path.join('.'), message: i.message })), warnings }
  const source = parsed.data, pkg = projectSituationPackage(source)
  const validation = validateSituationPackage(pkg)
  for (const i of validation.issues) (i.severity === 'error' ? errors : warnings).push({ code: 'PACKAGE_VALIDATION', path: i.path, message: i.message })
  // Every asserted key must have an expectation; omitted metrics cannot silently pass.
  const names = new Set<string>()
  for (const [i, g] of pkg.goldenCases.entries()) {
    if (names.has(g.name)) errors.push({ code: 'DUPLICATE_GOLDEN', path: `goldenCases.${i}.name`, message: g.name })
    names.add(g.name)
    if (JSON.stringify([...g.expected.metricKeys].sort()) !== JSON.stringify(Object.keys(g.expected.metrics).sort())) errors.push({ code: 'GOLDEN_METRIC_COVERAGE', path: `goldenCases.${i}.expected`, message: 'Each expected metric key requires an exact value (including null)' })
  }
  if (validation.valid) {
    const covered = new Set(pkg.goldenCases.flatMap(g => g.responses.map(r => `${r.sceneKey}:${r.channelKey}`)))
    for (const scene of pkg.definition.scenes) for (const channel of scene.channels) if (!covered.has(`${scene.sceneKey}:${channel.channelKey}`)) errors.push({ code: 'GOLDEN_CHANNEL_COVERAGE', path: `scenes.${scene.sceneKey}.${channel.channelKey}`, message: 'No golden response covers this channel' })
    if (pkg.definition.schemaVersion === 2) {
      const paths = pkg.goldenCases.map(g => deriveAuthoritativeSituationalTrajectory(pkg.definition, g.responses))
      const nodes = new Set(paths.flatMap(p => p.nodeKeys))
      const coveredEdges = new Set<string>()
      for (const g of pkg.goldenCases) {
        const trajectory = deriveAuthoritativeSituationalTrajectory(pkg.definition, g.responses)
        for (const n of pkg.definition.flow.nodes) if (n.nodeType === 'SCENE' && trajectory.nodeKeys.includes(n.nodeKey) && n.transition.type === 'DECISION') {
          const channelKey = n.transition.channelKey
          const r = g.responses.find(r => r.sceneKey === n.sceneKey && r.channelKey === channelKey)
          if (r) coveredEdges.add(`${n.nodeKey}:${r.responseValue}`)
        }
      }
      for (const n of pkg.definition.flow.nodes) {
        if (!nodes.has(n.nodeKey)) errors.push({ code: 'GOLDEN_NODE_COVERAGE', path: `flow.${n.nodeKey}`, message: 'Uncovered branch/terminal node' })
        if (n.nodeType === 'SCENE' && n.transition.type === 'DECISION') for (const b of n.transition.branches) if (!coveredEdges.has(`${n.nodeKey}:${b.optionKey}`)) errors.push({ code: 'GOLDEN_EDGE_COVERAGE', path: `flow.${n.nodeKey}.${b.optionKey}`, message: 'Uncovered decision edge' })
      }
    }
  }
  let runtime: ReturnType<typeof compileSituationRuntime> | undefined
  try {
    runtime = compileSituationRuntime({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition, sourceDefinitionHash: validation.definitionHash })
    const c = runtime.runtimeCapabilities
    if (!c.supported || !c.standalone || !c.embedded || !c.aggregateEligible || c.collectionFacts) errors.push({ code: 'UNSUPPORTED_CAPABILITY', path: 'runtimeCapabilities', message: 'Existing SJT execution contract is required' })
  } catch (e) { errors.push({ code: 'RUNTIME_COMPILE', path: 'definition', message: String(e) }) }
  return { identity: source.content.identity, eligibleToPublish: errors.length === 0, errors, warnings,
    definitionHash: validation.definitionHash, compiledRuntimeHash: runtime?.compiledRuntimeHash,
    scorerKey: runtime?.scorerKey, scoringVersion: runtime?.scorerVersion, runtimeCapabilities: runtime?.runtimeCapabilities,
    publicationContentDigest: publicationContentDigest(source.content), gateVersion: 'situational-onboarding-v1' }
}
