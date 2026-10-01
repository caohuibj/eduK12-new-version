import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { situationDefinitionV2Schema, type SituationDefinitionV2 } from '../situation-branching'
import { validateSituationPackage, type SituationPackage } from '../situation-package'
import { deriveAuthoritativeSituationalTrajectory } from '../situation-trajectory'
import { situationalPurposeSchema } from '../situation-definition'

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/)
const text = z.string().trim().min(1).max(16000)
const row = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict()
export const sjtAuthorTemplateSchema = row({
  templateVersion: z.literal('sjt-upload-v1'),
  instrumentKey: z
    .string()
    .max(80)
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  instrumentVersion: z
    .string()
    .max(40)
    .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  title: z.string().trim().min(1).max(200),
  respondentType: z.enum(['teacher_self_report', 'student_self_report']),
  entryNodeKey: key,
  author: z.string().trim().min(1).max(1000),
  sourceNote: z.string().trim().min(1).max(4000),
  disclaimer: z.string().trim().min(1).max(2000),
  licenseStatus: z.enum(['self_authored', 'authorized', 'unknown']),
  redistribution: z.enum(['allowed', 'restricted', 'unknown']),
  nodes: z
    .array(row({ nodeKey: key, motherSceneKey: key, title: text, stimulus: text }))
    .min(1)
    .max(40),
  questions: z
    .array(
      row({
        nodeKey: key,
        questionKey: key,
        prompt: text,
        kind: z.enum(['CORE', 'ORDINAL', 'NOMINAL', 'TEXT']),
        purpose: situationalPurposeSchema,
        required: z.boolean(),
        order: z.number().int().min(0).max(10),
        maxLength: z.number().int().min(1).max(2000).optional(),
      }),
    )
    .min(1)
    .max(240),
  options: z
    .array(
      row({
        questionKey: key,
        optionKey: key.or(z.string().regex(/^[1-9]$/)),
        label: text,
        nonanswerReason: z
          .enum(['UNABLE_TO_JUDGE', 'DECLINED', 'UNAVAILABLE_OR_DECLINED'])
          .optional(),
      }),
    )
    .min(2)
    .max(1600),
  transitions: z
    .array(
      row({
        nodeKey: key,
        optionKey: key.or(z.string().regex(/^[1-9]$/)),
        nextNodeKey: key,
        bridgeText: z.string().max(4000),
      }),
    )
    .min(1)
    .max(400),
  metrics: z
    .array(
      row({ metricKey: key, label: text, construct: key, role: z.enum(['primary', 'secondary']) }),
    )
    .min(1)
    .max(20),
  opportunities: z
    .array(row({ nodeKey: key, metricKey: key, applicability: z.enum(['OPPORTUNITY', 'NA']) }))
    .min(1)
    .max(800),
  scores: z
    .array(
      row({
        nodeKey: key,
        optionKey: key.or(z.string().regex(/^[1-9]$/)),
        metricKey: key,
        contribution: z.number().finite().min(-1000000).max(1000000),
      }),
    )
    .min(1)
    .max(4000),
  feedback: z
    .array(
      row({
        questionKey: key,
        optionKey: key.or(z.string().regex(/^[1-9]$/)),
        kind: z.enum(['ACTION', 'PROBE', 'GUIDANCE']),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(2000),
  comparisons: z
    .array(
      row({
        motherSceneKey: key,
        firstChannelKey: key,
        secondChannelKey: key,
        label: text,
        categories: z.array(z.string().min(1)).min(2).max(10),
      }),
    )
    .max(20),
  cases: z
    .array(
      row({
        name: text,
        responses: z
          .array(
            row({
              nodeKey: key,
              questionKey: key,
              responseValue: z.union([z.string().max(2000), z.number().finite()]),
            }),
          )
          .min(1)
          .max(240),
        expected: z.record(z.number().finite().nullable()),
      }),
    )
    .max(512),
})
export type SjtAuthorTemplate = z.infer<typeof sjtAuthorTemplateSchema>
export interface SjtAuthorIssue {
  path: string
  message: string
  code: string
}
export class SjtTemplateError extends Error {
  constructor(readonly issues: SjtAuthorIssue[]) {
    super('SJT 模板未通过校验')
  }
}

/** Declarative content only. The compiler has no script, URL fetching or publication authority. */
export function compileSjtTemplate(input: unknown): {
  template: SjtAuthorTemplate
  package: SituationPackage
  contentDigest: string
  definitionHash: string
} {
  const parsed = sjtAuthorTemplateSchema.safeParse(input)
  if (!parsed.success)
    throw new SjtTemplateError(
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: 'FIELD',
      })),
    )
  const t = parsed.data,
    issues: SjtAuthorIssue[] = []
  const fail = (path: string, message: string) => issues.push({ path, message, code: 'REFERENCE' })
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) fail(path, '标识或引用重复')
  }
  unique(
    t.nodes.map((n) => n.nodeKey),
    'nodes',
  )
  unique(
    t.questions.map((q) => q.questionKey),
    'questions',
  )
  unique(
    t.options.map((o) => `${o.questionKey}:${o.optionKey}`),
    'options',
  )
  unique(
    t.transitions.map((x) => `${x.nodeKey}:${x.optionKey}`),
    'transitions',
  )
  unique(
    t.metrics.map((m) => m.metricKey),
    'metrics',
  )
  unique(
    t.opportunities.map((o) => `${o.nodeKey}:${o.metricKey}`),
    'opportunities',
  )
  unique(
    t.scores.map((s) => `${s.nodeKey}:${s.optionKey}:${s.metricKey}`),
    'scores',
  )
  unique(
    t.feedback.map((f) => `${f.questionKey}:${f.optionKey}:${f.kind}`),
    'feedback',
  )
  unique(
    t.cases.map((c) => c.name),
    'cases',
  )
  if (t.nodes.some((n) => n.nodeKey === 'END')) fail('nodes', 'END 为保留终点标识')
  const nodes = new Map(t.nodes.map((n) => [n.nodeKey, n])),
    questions = new Map(t.questions.map((q) => [q.questionKey, q]))
  const core = new Map(
    t.nodes.map((n) => [
      n.nodeKey,
      t.questions.filter((q) => q.nodeKey === n.nodeKey && q.kind === 'CORE'),
    ]),
  )
  if (!nodes.has(t.entryNodeKey)) fail('entryNodeKey', '起点不存在')
  for (const n of t.nodes) {
    const qs = t.questions.filter((q) => q.nodeKey === n.nodeKey)
    if (core.get(n.nodeKey)?.length !== 1 || qs.length > 5)
      fail(`nodes.${n.nodeKey}`, '每节点需一个核心题，全部题目不超过五个')
    unique(
      qs.map((q) => String(q.order)),
      `nodes.${n.nodeKey}.order`,
    )
    for (const m of t.metrics)
      if (!t.opportunities.some((o) => o.nodeKey === n.nodeKey && o.metricKey === m.metricKey))
        fail('opportunities', `${n.nodeKey} × ${m.metricKey} 必须明确填写 OPPORTUNITY 或 NA`)
  }
  for (const q of t.questions) {
    if (!nodes.has(q.nodeKey)) fail('questions', '题目引用未知节点')
    if ((q.kind === 'CORE' && !q.required) || (q.kind !== 'CORE' && q.required))
      fail(`questions.${q.questionKey}`, '核心题必需响应；追问和文字为可选')
    const opts = t.options.filter((o) => o.questionKey === q.questionKey)
    if (
      (q.kind !== 'TEXT' && (opts.length < 2 || opts.length > 12)) ||
      (q.kind === 'TEXT' && opts.length)
    )
      fail('options', '单选需 2–12 个选项；文字题无选项')
    if (q.kind === 'TEXT' && !q.maxLength) fail('questions', '文字题需长度上限')
    if (q.kind === 'ORDINAL' && opts.filter((o) => !o.nonanswerReason).length !== 5)
      fail('options', '五级题需恰好五个有效类别')
    if (q.kind === 'CORE')
      for (const o of opts)
        if (!t.transitions.some((x) => x.nodeKey === q.nodeKey && x.optionKey === o.optionKey))
          fail('transitions', `${q.nodeKey}/${o.optionKey} 缺少下一节点或中性过渡`)
    if (q.kind !== 'TEXT')
      for (const o of opts)
        if (
          !t.feedback.some(
            (f) =>
              f.questionKey === q.questionKey &&
              f.optionKey === o.optionKey &&
              f.kind === (q.kind === 'CORE' ? 'ACTION' : 'PROBE'),
          )
        )
          fail('feedback', `${q.questionKey}/${o.optionKey} 缺少报告片段`)
  }
  for (const o of t.options) if (!questions.has(o.questionKey)) fail('options', '选项引用未知题目')
  for (const x of t.transitions)
    if (
      !nodes.has(x.nodeKey) ||
      (x.nextNodeKey !== 'END' && !nodes.has(x.nextNodeKey)) ||
      !t.options.some(
        (o) =>
          o.questionKey === core.get(x.nodeKey)?.[0]?.questionKey && o.optionKey === x.optionKey,
      )
    )
      fail('transitions', '过渡引用未知节点或核心选项')
  for (const o of t.opportunities)
    if (!nodes.has(o.nodeKey) || !t.metrics.some((m) => m.metricKey === o.metricKey))
      fail('opportunities', '评分机会引用不存在')
  for (const s of t.scores) {
    const q = core.get(s.nodeKey)?.[0],
      o = t.options.find((o) => o.questionKey === q?.questionKey && o.optionKey === s.optionKey)
    if (
      !o ||
      o.nonanswerReason ||
      !t.opportunities.some(
        (x) =>
          x.nodeKey === s.nodeKey &&
          x.metricKey === s.metricKey &&
          x.applicability === 'OPPORTUNITY',
      )
    )
      fail('scores', '评分键引用未知、非回答或 NA 选项')
  }
  for (const o of t.opportunities.filter((o) => o.applicability === 'OPPORTUNITY'))
    for (const option of t.options.filter(
      (x) => x.questionKey === core.get(o.nodeKey)?.[0]?.questionKey && !x.nonanswerReason,
    ))
      if (
        !t.scores.some(
          (s) =>
            s.nodeKey === o.nodeKey &&
            s.optionKey === option.optionKey &&
            s.metricKey === o.metricKey,
        )
      )
        fail('scores', `${o.nodeKey}/${option.optionKey}/${o.metricKey} 缺少贡献，不能默认为零`)
  for (const f of t.feedback)
    if (
      !t.options.some((o) => o.questionKey === f.questionKey && o.optionKey === f.optionKey) ||
      ((f.kind === 'ACTION' || f.kind === 'GUIDANCE') &&
        questions.get(f.questionKey)?.kind !== 'CORE') ||
      (f.kind === 'PROBE' && questions.get(f.questionKey)?.kind === 'CORE')
    )
      fail('feedback', '报告片段引用或类型不合法')
  for (const c of t.comparisons) {
    const a = questions.get(c.firstChannelKey),
      b = questions.get(c.secondChannelKey)
    const labels = (q: typeof a) =>
      t.options
        .filter((o) => o.questionKey === q?.questionKey && !o.nonanswerReason)
        .map((o) => `${o.optionKey}:${o.label}`)
    if (
      !a ||
      !b ||
      a.questionKey === b.questionKey ||
      a.kind !== 'ORDINAL' ||
      b.kind !== 'ORDINAL' ||
      a.prompt !== b.prompt ||
      nodes.get(a.nodeKey)?.motherSceneKey !== c.motherSceneKey ||
      nodes.get(b.nodeKey)?.motherSceneKey !== c.motherSceneKey ||
      JSON.stringify(labels(a)) !== JSON.stringify(labels(b)) ||
      JSON.stringify(c.categories) !==
        JSON.stringify(
          t.options
            .filter((o) => o.questionKey === a.questionKey && !o.nonanswerReason)
            .map((o) => o.optionKey),
        )
    )
      fail('comparisons', '只允许同母场景、同题干及同类别锚点的五级题比较')
  }
  if (issues.length) throw new SjtTemplateError(issues)
  // Deduplicate incoming bridge prefixes at the target, preserving true convergence.
  const variants = new Map<string, { logical: string; bridge: string }>()
  const variantKey = (logical: string, bridge: string) =>
    `${logical}_${canonicalHash(bridge).slice(0, 12)}`
  variants.set(variantKey(t.entryNodeKey, ''), { logical: t.entryNodeKey, bridge: '' })
  for (const x of t.transitions)
    if (x.nextNodeKey !== 'END')
      variants.set(variantKey(x.nextNodeKey, x.bridgeText), {
        logical: x.nextNodeKey,
        bridge: x.bridgeText,
      })
  if (variants.size > 120)
    throw new SjtTemplateError([
      { code: 'LIMIT', path: 'transitions', message: '过渡展开超过 120 节点上限' },
    ])
  const expertKey: NonNullable<SituationDefinitionV2['scoring']['model']>['expertKey'] = []
  const fragments: NonNullable<SituationDefinitionV2['report']['narrative']>['fragments'] = []
  const scenes: SituationDefinitionV2['scenes'] = [],
    flowNodes: SituationDefinitionV2['flow']['nodes'] = []
  for (const [physical, v] of variants) {
    const n = nodes.get(v.logical)!,
      qs = t.questions.filter((q) => q.nodeKey === n.nodeKey).sort((a, b) => a.order - b.order),
      cq = core.get(n.nodeKey)![0]!
    const channels = qs.map((q) =>
      q.kind === 'TEXT'
        ? {
            channelKey: q.questionKey,
            responseType: 'FREE_TEXT' as const,
            purpose: q.purpose,
            prompt: q.prompt,
            maxLength: q.maxLength!,
          }
        : {
            channelKey: q.questionKey,
            responseType: 'SINGLE_CHOICE' as const,
            purpose: q.purpose,
            prompt: q.prompt,
            options: t.options
              .filter((o) => o.questionKey === q.questionKey)
              .map((o) => ({
                optionKey: o.optionKey,
                label: o.label,
                ...(o.nonanswerReason ? { nonanswerReason: o.nonanswerReason } : {}),
              })),
          },
    )
    scenes.push({
      sceneKey: physical,
      title: n.title,
      sortOrder: scenes.length,
      stimulus: { type: 'TEXT_V1', text: [v.bridge, n.stimulus].filter(Boolean).join('\n\n') },
      primaryConstruct: t.metrics[0]!.construct,
      secondaryConstructs: t.metrics.slice(1).map((m) => m.construct),
      situationFeatures: {},
      channels,
      measurementBundle: {
        contractVersion: 'measurement-bundle-v1',
        maxRequiredResponses: 1,
        maxOptionalDiagnosticResponses: qs.length - 1,
        maxTotalResponses: qs.length,
        estimatedSeconds: 120,
      },
    })
    flowNodes.push({
      nodeType: 'SCENE',
      nodeKey: physical,
      sceneKey: physical,
      motherSceneKey: n.motherSceneKey,
      roundKey: n.nodeKey,
      stepKey: physical,
      interactionRole: 'DECISION',
      channelPolicies: qs.map((q) => ({
        channelKey: q.questionKey,
        required: q.required,
        measurementRole: q.kind === 'CORE' ? 'SCORED' : 'RAW_ONLY',
        interactionRole: q.kind === 'CORE' ? 'DECISION' : 'DIAGNOSTIC',
      })),
      responseStages: [
        { stageKey: 'choice', kind: 'CHOICE', channelKeys: [cq.questionKey] },
        ...(qs.length > 1
          ? [
              {
                stageKey: 'probes',
                kind: 'POST_CHOICE_PROBE' as const,
                channelKeys: qs.filter((q) => q !== cq).map((q) => q.questionKey),
              },
            ]
          : []),
      ],
      transition: {
        type: 'DECISION',
        channelKey: cq.questionKey,
        branches: t.transitions
          .filter((x) => x.nodeKey === n.nodeKey)
          .map((x) => ({
            optionKey: x.optionKey,
            nextNodeKey: x.nextNodeKey === 'END' ? 'END' : variantKey(x.nextNodeKey, x.bridgeText),
          })),
      },
    })
    for (const s of t.scores.filter((s) => s.nodeKey === n.nodeKey))
      expertKey.push({
        sceneKey: physical,
        channelKey: cq.questionKey,
        metricKey: s.metricKey,
        optionKey: s.optionKey,
        contribution: s.contribution,
      })
    for (const f of t.feedback.filter((f) => qs.some((q) => q.questionKey === f.questionKey)))
      fragments.push({
        sceneKey: physical,
        channelKey: f.questionKey,
        optionKey: f.optionKey,
        kind: f.kind,
        text: f.text,
      })
  }
  flowNodes.push({ nodeType: 'TERMINAL', nodeKey: 'END' })
  const definition = situationDefinitionV2Schema.parse({
    schemaVersion: 2,
    respondentType: t.respondentType,
    source: { title: t.title, citation: `${t.author}；${t.sourceNote}` },
    license: { status: t.licenseStatus, redistribution: t.redistribution, note: t.sourceNote },
    sampling: { strategy: 'BRANCH_REACHABLE' },
    scenes,
    flow: {
      strategy: 'BRANCHING_DAG_V1',
      entryNodeKey: variantKey(t.entryNodeKey, ''),
      nodes: flowNodes,
    },
    scoring: {
      scoringVersion: 'author-key-sum-v1',
      choiceScores: [],
      model: {
        contractVersion: 'situational-model-v1',
        modelKey: 'AUTHOR_KEY_SUM',
        modelVersion: '1',
        expertKey,
      },
      publishedMetrics: t.metrics.map((m) => ({
        key: m.metricKey,
        label: m.label,
        construct: m.construct,
        channelKey: 'core',
        direction: 'descriptive',
        role: m.role,
        displayPrecision: 0,
      })),
    },
    report: {
      reportVersion: 'sjt-narrative-v1',
      primaryMetricKeys: t.metrics.filter((m) => m.role === 'primary').map((m) => m.metricKey),
      metricOrder: t.metrics.map((m) => m.metricKey),
      interpretations: [],
      limitations: [
        '作者暂定评分键，尚未完成独立专家评审和实证校准。',
        '行为意向及辅助回答仅用于低风险反思，不用于教师选聘或能力等级判定。',
      ],
      disclaimer: t.disclaimer,
      narrative: { version: 'sjt-narrative-v1', fragments, comparisons: t.comparisons },
    },
    referencePolicy: { type: 'none' },
  })
  const goldenCases = t.cases.map((c) => {
    let physical = definition.flow.entryNodeKey
    const responses: SituationPackage['goldenCases'][number]['responses'] = []
    const visited = new Set<string>()
    while (physical !== 'END') {
      if (visited.has(physical)) break
      visited.add(physical)
      const v = variants.get(physical)!,
        cq = core.get(v.logical)![0]!
      const raw = c.responses.filter((r) => r.nodeKey === v.logical)
      for (const r of raw)
        responses.push({
          sceneKey: physical,
          channelKey: r.questionKey,
          responseValue: r.responseValue,
        })
      const chosen = raw.find((r) => r.questionKey === cq.questionKey)?.responseValue
      const x = t.transitions.find((x) => x.nodeKey === v.logical && x.optionKey === chosen)
      if (!x) break
      physical = x.nextNodeKey === 'END' ? 'END' : variantKey(x.nextNodeKey, x.bridgeText)
    }
    if (
      Object.keys(c.expected).sort().join() !==
      t.metrics
        .map((m) => m.metricKey)
        .sort()
        .join()
    )
      fail(`cases.${c.name}`, '需为全部指标填写期望值，包括 null')
    if (responses.length !== c.responses.length)
      fail(`cases.${c.name}`, '验收样例包含路径外或不存在的响应')
    return {
      name: c.name,
      responses,
      expected: {
        quality: Object.entries(c.expected).some(
          ([k, v]) => v === null && t.metrics.find((m) => m.metricKey === k)?.role === 'primary',
        )
          ? ('invalid' as const)
          : ('interpretable' as const),
        metricKeys: t.metrics.map((m) => m.metricKey),
        metrics: c.expected,
      },
    }
  })
  const pkg: SituationPackage = {
    key: t.instrumentKey,
    instrumentVersion: t.instrumentVersion,
    releaseStatus: 'DRAFT',
    definition,
    goldenCases,
  }
  const validation = validateSituationPackage(pkg)
  issues.push(
    ...validation.issues
      .filter((i) => i.severity === 'error' && !(i.path === 'goldenCases' && !t.cases.length))
      .map((i) => ({ code: 'RUNTIME', path: i.path, message: i.message })),
  )
  if (issues.length) throw new SjtTemplateError(issues)
  return {
    template: t,
    package: pkg,
    contentDigest: canonicalHash({ compilerVersion: 'sjt-upload-v1', template: t, package: pkg }),
    definitionHash: validation.definitionHash,
  }
}

export function assertSjtReleaseReady(compiled: ReturnType<typeof compileSjtTemplate>): void {
  const { package: pkg, template: t } = compiled,
    issues: SjtAuthorIssue[] = []
  if (t.licenseStatus === 'unknown' || t.redistribution === 'unknown')
    issues.push({
      path: 'licenseStatus',
      code: 'SOURCE',
      message: '发布前需明确内容来源与使用授权',
    })
  // Authors supply independent expected scores. Coverage cannot be met by fabricated compiler outputs.
  const covered = new Set<string>()
  for (const c of t.cases)
    for (const r of c.responses) covered.add(`${r.nodeKey}:${r.questionKey}:${r.responseValue}`)
  for (const q of t.questions)
    for (const o of t.options.filter((o) => o.questionKey === q.questionKey))
      if (!covered.has(`${q.nodeKey}:${q.questionKey}:${o.optionKey}`))
        issues.push({
          path: 'cases',
          code: 'COVERAGE',
          message: `验收样例未覆盖 ${q.nodeKey}/${q.questionKey}/${o.optionKey}`,
        })
  for (const c of pkg.goldenCases)
    if (!deriveAuthoritativeSituationalTrajectory(pkg.definition, c.responses).reachedTerminal)
      issues.push({ path: 'cases', code: 'TERMINAL', message: '验收样例未到达终点' })
  if (issues.length || !t.cases.length)
    throw new SjtTemplateError(
      issues.length
        ? issues
        : [{ path: 'cases', code: 'COVERAGE', message: '发布前需独立核算验收样例' }],
    )
}
