import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { RegistryEntry } from '../cognitive.types'
import { buildCognitiveV2TaskDefinition } from '../v2/registry'
import { projectThreeLayerReport } from '../v2/report'
import { runAuthoritativeScorer } from '../v2/authoritative-scorer'
import { createSessionConfigSnapshot } from '../v2/session-snapshot'
import { createTrialEnvelope } from '../v2/trial-envelope'
import { computeProtocolSignature } from '../v2/canonical'
import { resolveParticipantPresentation } from '../participant-presentation'
import type { CognitiveBlockerV1 } from './decision'

export const executableFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z
      .object({
        testType: z.string(),
        engineVersion: z.string(),
        scoringVersion: z.string(),
      })
      .strict(),
    provenance: z.string().min(1),
    legacyFractionalMetrics: z
      .object({
        baselineCommit: z.string().regex(/^[0-9a-f]{40}$/),
        reason: z.string().min(1),
        keys: z.array(z.string()).min(1),
      })
      .strict()
      .optional(),
    cases: z
      .array(
        z
          .object({
            name: z.string().min(1),
            input: z
              .object({
                config: z.unknown(),
                randomSeed: z.string().optional(),
                trials: z.array(
                  z
                    .object({
                      trialIndex: z.number().int().nonnegative(),
                      payload: z.unknown(),
                    })
                    .strict(),
                ),
              })
              .strict(),
            expected: z.unknown().optional(),
            expectedError: z.string().optional(),
          })
          .strict(),
      )
      .min(3),
  })
  .strict()
const finite = (v: unknown): boolean =>
  typeof v === 'number'
    ? Number.isFinite(v)
    : Array.isArray(v)
      ? v.every(finite)
      : v !== null && typeof v === 'object'
        ? Object.values(v).every(finite)
        : true
export function validateExecutableFixtures(
  entry: RegistryEntry<unknown, unknown>,
  raw: unknown,
  file: string,
): CognitiveBlockerV1[] {
  const blockers: CognitiveBlockerV1[] = []
  const add = (
    code: string,
    domain: CognitiveBlockerV1['domain'],
    fieldPath: string,
    message: string,
  ) =>
    blockers.push({
      schemaVersion: 1,
      code,
      severity: 'ERROR',
      domain,
      gate: 'PILOT_PUBLISH',
      file,
      fieldPath,
      message,
      remediation: {
        type: 'EDIT_FIELD',
        hint: 'Repair the task-owned fixture or implementation; preserve independent historical golden tests.',
      },
    })
  const parsed = executableFixtureSchema.safeParse(raw)
  if (!parsed.success) {
    add('COG_FIXTURE_INVALID', 'SCORING', 'cases', parsed.error.message)
    return blockers
  }
  const fixture = parsed.data
  if (
    Object.entries(fixture.identity).some(
      ([k, v]) => entry[k as keyof typeof fixture.identity] !== v,
    )
  )
    add(
      'COG_FIXTURE_IDENTITY_MISMATCH',
      'IDENTITY',
      'identity',
      'Fixture must bind the exact execution identity.',
    )
  for (const name of ['golden', 'empty', 'insufficient'])
    if (!fixture.cases.some((c) => c.name === name))
      add(
        'COG_FIXTURE_CASE_MISSING',
        'SCORING',
        'cases',
        `Missing ${name} case.`,
      )
  const definition = buildCognitiveV2TaskDefinition(entry)
  for (const [i, c] of fixture.cases.entries()) {
    const field = `cases.${i}`
    if ((c.expected === undefined) === (c.expectedError === undefined)) {
      add(
        'COG_FIXTURE_EXPECTATION_INVALID',
        'SCORING',
        field,
        'Exactly one expected output or expected error is required.',
      )
      continue
    }
    if (
      c.name === 'golden' &&
      (c.input.trials.length === 0 || c.expectedError !== undefined)
    )
      add(
        'COG_NORMAL_FIXTURE_INVALID',
        'SCORING',
        field,
        'Normal fixture must score nonempty trials.',
      )
    if (c.name === 'empty' && c.input.trials.length !== 0)
      add(
        'COG_BOUNDARY_FIXTURE_INVALID',
        'SCORING',
        field,
        'Empty fixture must contain no trials.',
      )
    if (!entry.configSchema.safeParse(c.input.config).success)
      add(
        'COG_FIXTURE_CONFIG_INVALID',
        'PROFILE',
        field + '.input.config',
        'Fixture config does not match the task schema.',
      )
    for (const [j, t] of c.input.trials.entries())
      if (!entry.trialSchema.safeParse(t.payload).success)
        add(
          'COG_FIXTURE_TRIAL_INVALID',
          'EXECUTION',
          `${field}.input.trials.${j}`,
          'Trial payload does not match its schema.',
        )
    try {
      const input = {
        config: c.input.config,
        randomSeed: c.input.randomSeed,
        trials: c.input.trials.map((t) => ({
          trialIndex: t.trialIndex,
          payload: t.payload,
        })),
      }
      const copy = structuredClone(input),
        before = JSON.stringify(copy),
        output = entry.score(copy)
      if (
        c.expectedError !== undefined ||
        !isDeepStrictEqual(output, c.expected)
      )
        add(
          'COG_SCORING_GOLDEN_MISMATCH',
          'SCORING',
          field,
          'Scorer output differs from the committed expectation.',
        )
      if (!finite(output))
        add(
          'COG_NONFINITE_OUTPUT',
          'METRIC',
          field,
          'Scorer emitted a nonfinite value.',
        )
      if (
        !isDeepStrictEqual(output, entry.score(structuredClone(input))) ||
        before !== JSON.stringify(copy)
      )
        add(
          'COG_SCORING_NONDETERMINISTIC',
          'SCORING',
          field,
          'Scorer must be deterministic for fixed input.',
        )
      for (const [key, metric] of Object.entries(definition.metrics)) {
        if (!(key in output.metrics)) {
          add(
            'COG_METRIC_OUTPUT_MISSING',
            'METRIC',
            `${field}.metrics.${key}`,
            'Declared metric is absent from output.',
          )
          continue
        }
        const value = output.metrics[key]
        if (
          metric.valueType === 'integer' &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          !Number.isInteger(value) &&
          fixture.legacyFractionalMetrics?.keys.includes(key)
        ) {
          blockers.push({
            schemaVersion: 1,
            code: 'COG_LEGACY_FRACTIONAL_COUNT',
            severity: 'WARNING',
            domain: 'COMPATIBILITY',
            gate: 'PILOT_PUBLISH',
            file,
            fieldPath: `${field}.metrics.${key}`,
            message: fixture.legacyFractionalMetrics.reason,
            remediation: {
              type: 'HUMAN_REVIEW',
              hint: 'Correct the integer declaration in a new task version; do not rewrite historical execution hashes.',
            },
          })
          continue
        }
        if (
          value !== null &&
          (metric.valueType === 'integer'
            ? !Number.isInteger(value)
            : metric.valueType === 'number'
              ? typeof value !== 'number'
              : metric.valueType === 'array'
                ? !Array.isArray(value)
                : typeof value !== 'object' || Array.isArray(value))
        )
          add(
            'COG_METRIC_TYPE_INVALID',
            'METRIC',
            `${field}.metrics.${key}`,
            'Metric output does not match its declared value type.',
          )
      }
      const trials = c.input.trials.map((t) =>
        createTrialEnvelope({
          trialIndex: t.trialIndex,
          payload: t.payload,
          phase:
            (t.payload as { phase?: 'learning' | 'delayed' })?.phase ??
            definition.protocol.phases.find((p) => p.persists)!.key,
          startedAtPerfMs: t.trialIndex * 100,
          endedAtPerfMs: t.trialIndex * 100 + 50,
        }),
      )
      const session = createSessionConfigSnapshot({
        definition,
        configVersion: 'fixture',
        config: c.input.config,
        frozenAt: new Date('2026-01-01T00:00:00Z'),
      })
      const score = runAuthoritativeScorer({
        definition,
        session,
        trials,
        randomSeed: c.input.randomSeed ?? 'fixture',
      })
      for (const profile of Object.keys(definition.profiles)) {
        const report = projectThreeLayerReport({
          ...fixture.identity,
          configVersion: 'fixture',
          protocolSignature: computeProtocolSignature(definition.protocol),
          profile: profile as 'standard',
          definition: definition.report,
          score,
          metrics: score.metrics,
          metricDefinitions: definition.metrics,
          qualityDefinitions: definition.quality,
          participantPresentation: resolveParticipantPresentation(entry),
        })
        if (!report.title || !report.disclaimer || !finite(report))
          add(
            'COG_REPORT_INVALID',
            'REPORT',
            field,
            'Report title, disclaimer and finite values are required.',
          )
        if (
          score.quality.state === 'invalid' &&
          (report.headline.length || report.user.length || report.detail.length)
        )
          add(
            'COG_INVALID_QUALITY_LEAK',
            'QUALITY',
            field,
            'Invalid results must suppress participant metrics.',
          )
      }
    } catch (error) {
      if (
        c.expectedError === undefined ||
        (error as Error).message !== c.expectedError
      )
        add(
          'COG_FIXTURE_EXECUTION_FAILED',
          'SCORING',
          field,
          (error as Error).message,
        )
    }
  }
  return blockers
}
