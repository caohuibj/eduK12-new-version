import type { DefinitionIssue } from './situation-definition'
import type { SituationDefinitionV2 } from './situation-branching'

/** Narrow cross-field publication contract. No candidate mapping implies a score. */
export function validateSituationalScientificDesign(definition: SituationDefinitionV2): DefinitionIssue[] {
  const issues: DefinitionIssue[] = []
  const fail = (path: string, message: string) => issues.push({ path, message, severity: 'error' })
  const pairs = new Map<string, SituationDefinitionV2['scenes'][number]['channels'][number]>(definition.scenes.flatMap(s => s.channels.map(c => [`${s.sceneKey}:${c.channelKey}`, c] as const)))
  const nodes = definition.flow.nodes.filter(n => n.nodeType === 'SCENE')
  for (const node of nodes) {
    const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)
    if (!scene) continue
    const policy = (key: string) => node.channelPolicies?.find(p => p.channelKey === key)
    const bundle = scene.measurementBundle
    const required = scene.channels.filter(c => policy(c.channelKey)?.required !== false)
    const optional = scene.channels.filter(c => policy(c.channelKey)?.required === false)
    if (bundle) {
      if (required.length > bundle.maxRequiredResponses || optional.length > bundle.maxOptionalDiagnosticResponses || scene.channels.length > bundle.maxTotalResponses) fail(`flow.${node.nodeKey}`, 'Measurement bundle exceeds frozen respondent burden limits')
      if (optional.some(c => policy(c.channelKey)?.interactionRole !== 'DIAGNOSTIC')) fail(`flow.${node.nodeKey}`, 'Optional bundle responses must be diagnostic')
    } else if (scene.channels.length > 3) fail(`flow.${node.nodeKey}`, 'More than three channels requires an explicit measurement bundle')
    for (const channel of scene.channels) {
      const role = policy(channel.channelKey)?.measurementRole ?? 'SCORED'
      if (channel.responseType === 'FREE_TEXT' && (role !== 'RAW_ONLY' || policy(channel.channelKey)?.required !== false)) fail(`scenes.${scene.sceneKey}.${channel.channelKey}`, 'Free text must be optional RAW_ONLY')
      if (channel.responseType === 'SINGLE_CHOICE' && channel.options.some(o => o.nonanswerReason) && role === 'SCORED' && definition.scoring.model?.modelKey !== 'AUTHOR_KEY_SUM') fail(`scenes.${scene.sceneKey}.${channel.channelKey}`, 'Scored nonanswers require AUTHOR_KEY_SUM')
      if (role === 'SCORED' && !channel.scoredConstruct && (!definition.scoring.model || definition.scoring.model.modelKey === 'PROVISIONAL_SCALAR')) fail(`scenes.${scene.sceneKey}.${channel.channelKey}`, 'Scalar SCORED channels require a scoredConstruct')
      if (node.transition.type === 'DECISION' && node.transition.channelKey === channel.channelKey && policy(channel.channelKey)?.interactionRole === 'DIAGNOSTIC') fail(`flow.${node.nodeKey}`, 'Diagnostic channels cannot route')
      if (channel.responseType === 'SINGLE_CHOICE') for (const option of channel.options) {
        const seen = new Set<string>()
        for (const mapping of option.evidence?.opportunities ?? []) {
          if (seen.has(mapping.constructKey)) fail(`scenes.${scene.sceneKey}.${channel.channelKey}.${option.optionKey}`, 'Duplicate/conflicting construct opportunity')
          seen.add(mapping.constructKey)
        }
      }
    }
    if (node.responseStages) {
      const channelKeys = new Set(scene.channels.map(c => c.channelKey))
      const used = new Set<string>(), stages = new Set<string>()
      let choiceCount = 0, choiceSeen = false, postSeen = false
      for (const stage of node.responseStages) {
        if (stages.has(stage.stageKey)) fail(`flow.${node.nodeKey}`, 'Duplicate response stage')
        stages.add(stage.stageKey)
        if (stage.kind === 'CHOICE') { choiceCount++; choiceSeen = true; if (postSeen) fail(`flow.${node.nodeKey}`, 'Choice cannot follow post probes') }
        if (stage.kind === 'PRE_CHOICE_PROBE' && choiceSeen) fail(`flow.${node.nodeKey}`, 'Pre probes must precede choice')
        if (stage.kind === 'POST_CHOICE_PROBE') { postSeen = true; if (!choiceSeen) fail(`flow.${node.nodeKey}`, 'Post probes require confirmed choice') }
        for (const key of stage.channelKeys) {
          if (!channelKeys.has(key) || used.has(key)) fail(`flow.${node.nodeKey}`, 'Stages must partition the response surface exactly once')
          used.add(key)
          const interaction = policy(key)?.interactionRole
          if (stage.kind !== 'CHOICE' && interaction !== 'DIAGNOSTIC') fail(`flow.${node.nodeKey}`, 'Probe stages require explicit DIAGNOSTIC interaction role')
          if (stage.kind === 'CHOICE' && interaction !== 'DECISION') fail(`flow.${node.nodeKey}`, 'Choice stage requires explicit DECISION interaction role')
        }
      }
      if (choiceCount !== 1 || used.size !== channelKeys.size) fail(`flow.${node.nodeKey}`, 'Staged nodes require exactly one choice stage and all channels')
      if (node.transition.type === 'DECISION' && !node.responseStages.find(s => s.kind === 'CHOICE')?.channelKeys.includes(node.transition.channelKey)) fail(`flow.${node.nodeKey}`, 'Routing response must belong to choice stage')
    }
    const variants = node.stimulusVariants ?? []
    if (new Set(variants.map(v => v.variantKey)).size !== variants.length || new Set(variants.map(v => v.compatibilityGroup)).size > 1) fail(`flow.${node.nodeKey}`, 'Consequence variants require unique identities and one compatibility group')
    if (variants.some(v => v.stimulus.type !== 'TEXT_V1' && !v.stimulus.text?.trim())) fail(`flow.${node.nodeKey}`, 'Consequence media variants require text fallback')
  }
  const groups = definition.researchAssignment?.groups ?? []
  const groupKeys = new Set<string>(), assignedNodes = new Set<string>()
  for (const group of groups) {
    if (groupKeys.has(group.groupKey) || assignedNodes.has(group.nodeKey)) fail('researchAssignment', 'Only one assignment group per node; group identities must be unique')
    groupKeys.add(group.groupKey); assignedNodes.add(group.nodeKey)
    const node = nodes.find(n => n.nodeKey === group.nodeKey)
    if (!node) { fail('researchAssignment', 'Assignment references unknown node'); continue }
    if (new Set(group.variants.map(v => v.variantKey)).size !== group.variants.length) fail('researchAssignment', 'Duplicate assignment variant')
    for (const variant of group.variants) {
      if (new Set(variant.omittedChannelKeys).size !== variant.omittedChannelKeys.length) fail('researchAssignment', 'Duplicate planned omission')
      for (const key of variant.omittedChannelKeys) {
        const p = node.channelPolicies?.find(p => p.channelKey === key)
        if (!pairs.has(`${node.sceneKey}:${key}`) || p?.interactionRole !== 'DIAGNOSTIC' || p.required !== false || (p.measurementRole ?? 'SCORED') === 'SCORED') fail('researchAssignment', 'Planned missingness is restricted to optional non-scored diagnostics')
      }
      if (variant.probeTiming !== 'DEFINED' && !node.responseStages) fail('researchAssignment', 'Timing assignments require explicit stages')
      if (variant.stimulusVariantKey && !node.stimulusVariants?.some(v => v.variantKey === variant.stimulusVariantKey)) fail('researchAssignment', 'Unknown compatible consequence variant')
    }
  }
  const narrative = definition.report.narrative
  if (narrative) {
    if (definition.scoring.model?.modelKey !== 'AUTHOR_KEY_SUM') fail('report.narrative','叙述报告规则需要 AUTHOR_KEY_SUM')
    const seen = new Set<string>()
    for (const [i,f] of narrative.fragments.entries()) {
      const channel = pairs.get(`${f.sceneKey}:${f.channelKey}`), node = nodes.find(n=>n.sceneKey===f.sceneKey)
      const role = node?.channelPolicies?.find(p=>p.channelKey===f.channelKey)?.measurementRole
      const id = `${f.sceneKey}:${f.channelKey}:${f.optionKey}:${f.kind}`
      if (seen.has(id) || channel?.responseType !== 'SINGLE_CHOICE' || !channel.options.some(o=>o.optionKey===f.optionKey) || (f.kind==='PROBE' ? role!=='RAW_ONLY' : role!=='SCORED')) fail(`report.narrative.fragments.${i}`,'报告片段引用或类型不合法')
      seen.add(id)
    }
    for (const [i,c] of narrative.comparisons.entries()) {
      const channels = [c.firstChannelKey,c.secondChannelKey].map(key=>nodes.filter(n=>n.motherSceneKey===c.motherSceneKey).map(n=>pairs.get(`${n.sceneKey}:${key}`)).filter(ch=>ch!==undefined))
      const a=channels[0]?.[0],b=channels[1]?.[0]
      const anchors=(ch:typeof a)=>ch?.responseType==='SINGLE_CHOICE'?ch.options.filter(o=>!o.nonanswerReason).map(o=>({key:o.optionKey,label:o.label})):[]
      if (!a || !b || c.firstChannelKey===c.secondChannelKey || a.prompt!==b.prompt || anchors(a).length!==5 || JSON.stringify(anchors(a))!==JSON.stringify(anchors(b)) || JSON.stringify(anchors(a).map(o=>o.key))!==JSON.stringify(c.categories) || channels.some(list=>list.some(ch=>ch.responseType!=='SINGLE_CHOICE' || JSON.stringify(anchors(ch))!==JSON.stringify(anchors(a))))) fail(`report.narrative.comparisons.${i}`,'重复题比较需同母场景、相同五级锚点')
    }
  }
  const model = definition.scoring.model
  if (!model) return issues
  if (model.modelKey === 'EXPERT_KEY' || model.modelKey === 'AUTHOR_KEY_SUM') {
    if (!model.expertKey?.length || model.parameterSet) fail('scoring.model', 'Expert scorer requires an explicit provisional key, without latent parameter set')
    const seen = new Set<string>(), metrics = new Set(definition.scoring.publishedMetrics.map(m => m.key))
    for (const entry of model.expertKey ?? []) {
      const pair = `${entry.sceneKey}:${entry.channelKey}`
      const channel = pairs.get(pair), node = nodes.find(n => n.sceneKey === entry.sceneKey)
      const policy = node?.channelPolicies?.find(p => p.channelKey === entry.channelKey)
      if (!metrics.has(entry.metricKey) || channel?.responseType !== 'SINGLE_CHOICE' || !channel.options.some(o => o.optionKey === entry.optionKey && !o.nonanswerReason) || (policy?.measurementRole ?? 'SCORED') !== 'SCORED') fail('scoring.model.expertKey', 'Expert contribution references an unknown/non-scored option or metric')
      const identity = `${pair}:${entry.optionKey}:${entry.metricKey}`
      if (seen.has(identity)) fail('scoring.model.expertKey', 'Duplicate expert contribution')
      seen.add(identity)
      const metric = definition.scoring.publishedMetrics.find(m => m.key === entry.metricKey)
      if (channel?.responseType === 'SINGLE_CHOICE' && metric && channel.options.find(o => o.optionKey === entry.optionKey)?.evidence?.opportunities.some(o => o.constructKey === metric.construct && o.role === 'FORBIDDEN_INFERENCE')) fail('scoring.model.expertKey', 'Expert key contradicts forbidden inference')
    }
    const backedPairs = new Set((model.expertKey ?? []).map(e => `${e.sceneKey}:${e.channelKey}`))
    for (const node of nodes) for (const channel of definition.scenes.find(s => s.sceneKey === node.sceneKey)?.channels ?? []) {
      if ((node.channelPolicies?.find(p => p.channelKey === channel.channelKey)?.measurementRole ?? 'SCORED') === 'SCORED' && !backedPairs.has(`${node.sceneKey}:${channel.channelKey}`)) fail('scoring.model.expertKey', 'Every SCORED channel needs explicit expert evidence; use RAW_ONLY/DESCRIPTIVE for unscored probes')
    }
    for (const metric of definition.scoring.publishedMetrics) {
      const backed = new Set((model.expertKey ?? []).filter(e => e.metricKey === metric.key).map(e => `${e.sceneKey}:${e.channelKey}`))
      if (!backed.size) fail('scoring.model.expertKey', 'Every published metric needs explicit expert evidence')
      for (const pair of backed) {
        const channel = pairs.get(pair)
        if (channel?.responseType === 'SINGLE_CHOICE') for (const option of channel.options) if (!option.nonanswerReason && !seen.has(`${pair}:${option.optionKey}:${metric.key}`)) fail('scoring.model.expertKey', 'Every expert-backed option requires explicit contribution; no hidden zero')
      }
    }
  } else if (model.expertKey) fail('scoring.model', 'Expert key is exclusive to EXPERT_KEY')
  if (model.modelKey.startsWith('NOMINAL_') && !model.parameterSet) fail('scoring.model.parameterSet', 'Nominal models require exact offline calibration provenance')

  if (model.modelKey === 'PROVISIONAL_SCALAR' && model.parameterSet) fail('scoring.model', 'Scalar scoring cannot claim calibrated latent parameters')
  const referenced = new Set<string>()
  for (const ref of model.parameterSet?.references ?? []) {
    const channel = pairs.get(`${ref.sceneKey}:${ref.channelKey}`)
    const node = nodes.find(n => n.sceneKey === ref.sceneKey)
    const policy = node?.channelPolicies?.find(p => p.channelKey === ref.channelKey)
    const option = channel?.responseType === 'SINGLE_CHOICE' ? channel.options.find(o => o.optionKey === ref.optionKey) : undefined
    const identity = `${ref.sceneKey}:${ref.channelKey}:${ref.optionKey}:${ref.constructKey}`
    if (!option || (policy?.measurementRole ?? 'SCORED') !== 'SCORED') fail('scoring.model.parameterSet.references', 'Unknown/non-scored calibrated option reference')
    if (referenced.has(identity)) fail('scoring.model.parameterSet.references', 'Duplicate option × construct parameter reference')
    referenced.add(identity)
    if (!definition.scoring.publishedMetrics.some(m => m.construct === ref.constructKey) && !option?.evidence?.opportunities.some(o => o.constructKey === ref.constructKey)) fail('scoring.model.parameterSet.references', 'Calibrated construct lacks declared opportunity or metric')
    if (option?.evidence?.opportunities.some(o => o.constructKey === ref.constructKey && o.role === 'FORBIDDEN_INFERENCE')) fail('scoring.model.parameterSet.references', 'Calibrated reference contradicts forbidden inference')
  }
  return issues
}
