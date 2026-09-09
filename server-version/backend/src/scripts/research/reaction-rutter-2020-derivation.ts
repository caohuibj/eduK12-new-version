import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import {
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
} from '../../modules/assessment-reference/reference'

export type ReactionReferenceMetric = 'medianRtMs' | 'rtICV'

export interface RutterColumnMapping {
  age: string
  medianRtMs: string
  rtICV: string
}

export interface EqualityFilter {
  column: string
  value: string
}

export interface NumericSummary {
  n: number
  mean: number | null
  sd: number | null
}

export interface ReactionRutterAgeBin {
  ageYears: number
  medianRtMs: NumericSummary
  rtICV: NumericSummary
}

export interface ReactionRutterDerivation {
  sourceFile: string
  sourceSha256: string
  selectedRows: number
  overall: {
    medianRtMs: NumericSummary
    rtICV: NumericSummary
  }
  ageBins: ReactionRutterAgeBin[]
}

export interface PaperSummaryExpectation {
  participantN: number
  medianRtMs: { mean: number; sd: number; tolerance: number }
  rtICV: { mean: number; sd: number; tolerance: number }
}

export interface PaperReproductionCheck {
  pass: boolean
  expected: PaperSummaryExpectation
  actual: ReactionRutterDerivation['overall']
  failures: string[]
}

export const RUTTER_2020_PAPER_SUMMARY: PaperSummaryExpectation = {
  participantN: 10060,
  medianRtMs: { mean: 301, sd: 60, tolerance: 1 },
  rtICV: { mean: 0.33, sd: 0.17, tolerance: 0.01 },
}

export const RUTTER_2020_SOURCE = {
  citation: 'Rutter LA, Vahia IV, Forester BP, Ressler KJ, Germine L. Heterogeneous Indicators of Cognitive Performance and Performance Variability Across the Lifespan. Front Aging Neurosci. 2020;12:62.',
  doi: '10.3389/fnagi.2020.00062',
  articleUrl: 'https://www.frontiersin.org/journals/aging-neuroscience/articles/10.3389/fnagi.2020.00062/full',
  osfProject: 'https://osf.io/w5nge/',
} as const

const round = (value: number, digits = 12): number => Number(value.toFixed(digits))

export const parseCsvRecords = (text: string): Array<Record<string, string>> => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      pushCell()
    } else if (char === '\n') {
      pushRow()
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (quoted) throw new Error('CSV ends inside a quoted field')
  if (cell.length > 0 || row.length > 0) pushRow()
  if (rows.length === 0) return []

  const headers = rows[0].map((header) => header.trim())
  if (headers.some((header) => header.length === 0)) throw new Error('CSV contains an empty header')
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate headers')

  return rows.slice(1)
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values, rowIndex) => {
      if (values.length !== headers.length) {
        throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`)
      }
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    })
}

const numeric = (value: string | undefined): number | null => {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const summary = (values: number[]): NumericSummary => {
  if (values.length === 0) return { n: 0, mean: null, sd: null }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (values.length === 1) return { n: 1, mean: round(mean), sd: null }
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
  return { n: values.length, mean: round(mean), sd: round(Math.sqrt(variance)) }
}

const matchesFilters = (record: Record<string, string>, filters: EqualityFilter[]): boolean =>
  filters.every((filter) => record[filter.column] === filter.value)

export const deriveReactionRutterParticipantMetrics = (input: {
  csvText: string
  sourceFile: string
  mapping: RutterColumnMapping
  filters?: EqualityFilter[]
}): ReactionRutterDerivation => {
  const records = parseCsvRecords(input.csvText)
  const filters = input.filters ?? []
  const selected = records.filter((record) => matchesFilters(record, filters))

  const participants = selected.map((record, index) => {
    const age = numeric(record[input.mapping.age])
    if (age == null || !Number.isInteger(age) || age < 0) {
      throw new Error(`Selected row ${index + 1} has invalid integer age in column ${input.mapping.age}`)
    }
    return {
      age,
      medianRtMs: numeric(record[input.mapping.medianRtMs]),
      rtICV: numeric(record[input.mapping.rtICV]),
    }
  })

  const ages = [...new Set(participants.map((participant) => participant.age))].sort((left, right) => left - right)
  return {
    sourceFile: input.sourceFile,
    sourceSha256: createHash('sha256').update(input.csvText).digest('hex'),
    selectedRows: selected.length,
    overall: {
      medianRtMs: summary(participants.flatMap((participant) => participant.medianRtMs == null ? [] : [participant.medianRtMs])),
      rtICV: summary(participants.flatMap((participant) => participant.rtICV == null ? [] : [participant.rtICV])),
    },
    ageBins: ages.map((ageYears) => {
      const rows = participants.filter((participant) => participant.age === ageYears)
      return {
        ageYears,
        medianRtMs: summary(rows.flatMap((participant) => participant.medianRtMs == null ? [] : [participant.medianRtMs])),
        rtICV: summary(rows.flatMap((participant) => participant.rtICV == null ? [] : [participant.rtICV])),
      }
    }),
  }
}

const differsByMoreThan = (actual: number | null, expected: number, tolerance: number): boolean =>
  actual == null || Math.abs(actual - expected) > tolerance

export const verifyRutterPaperSummary = (
  derivation: ReactionRutterDerivation,
  expected: PaperSummaryExpectation = RUTTER_2020_PAPER_SUMMARY,
): PaperReproductionCheck => {
  const failures: string[] = []
  for (const metric of ['medianRtMs', 'rtICV'] as const) {
    const actual = derivation.overall[metric]
    const target = expected[metric]
    if (actual.n !== expected.participantN) failures.push(`${metric}.n=${actual.n}; expected ${expected.participantN}`)
    if (differsByMoreThan(actual.mean, target.mean, target.tolerance)) failures.push(`${metric}.mean=${actual.mean}; expected ${target.mean}±${target.tolerance}`)
    if (differsByMoreThan(actual.sd, target.sd, target.tolerance)) failures.push(`${metric}.sd=${actual.sd}; expected ${target.sd}±${target.tolerance}`)
  }
  return { pass: failures.length === 0, expected, actual: derivation.overall, failures }
}

const metricLimitations = (metric: ReactionReferenceMetric): string[] => [
  'Rutter et al. used 30 scored Simple RT trials; Huisurvey profiles currently use 8/20/60 trials.',
  'Rutter et al. trimmed Simple RT values below 200 ms; the current Huisurvey Reaction scorer accepts valid RT values from 100 ms through timeout.',
  'The source is a web volunteer sample with mixed keyboard/touch administration and is not a population-representative K12 norm.',
  'Age-year bins are encoded as month ranges only for exact applicability; they do not imply month-level empirical precision.',
  ...(metric === 'rtICV'
    ? ['Within-participant SD implementation and trial-count sensitivity must be verified before any production use of rtICV.']
    : []),
]

export const buildRutterDraftReferenceSet = (input: {
  derivation: ReactionRutterDerivation
  reproduction: PaperReproductionCheck
  metrics: ReactionReferenceMetric[]
  minAgeYears?: number
  maxAgeYears?: number
  minimumAgeBinN?: number
}): AssessmentReferenceSetDefinition => {
  if (!input.reproduction.pass) {
    throw new Error(`Paper reproduction gate failed: ${input.reproduction.failures.join('; ')}`)
  }
  if (input.metrics.length === 0) throw new Error('At least one candidate metric must be explicitly selected')
  if (new Set(input.metrics).size !== input.metrics.length) throw new Error('Candidate metrics must not contain duplicates')

  const minAge = input.minAgeYears ?? 10
  const maxAge = input.maxAgeYears ?? 18
  const minimumAgeBinN = input.minimumAgeBinN ?? 25
  const entries: AssessmentReferenceSetDefinition['entries'] = []

  for (const ageBin of input.derivation.ageBins) {
    if (ageBin.ageYears < minAge || ageBin.ageYears > maxAge) continue
    for (const metric of input.metrics) {
      const metricSummary = ageBin[metric]
      if (metricSummary.n < minimumAgeBinN || metricSummary.mean == null || metricSummary.sd == null) continue
      entries.push({
        scoreKey: metric,
        referenceKind: 'descriptive_sample',
        evidenceLevel: 'literature_beta',
        provenanceType: 'literature_derived_estimate',
        instrumentVersion: '1.0.0',
        scoringVersion: '1.1.0',
        population: {
          description: `Rutter et al. 2020 TestMyBrain web volunteer sample, reported age ${ageBin.ageYears} years`,
          match: {
            minAgeMonthsInclusive: ageBin.ageYears * 12,
            maxAgeMonthsExclusive: (ageBin.ageYears + 1) * 12,
          },
        },
        source: {
          citation: RUTTER_2020_SOURCE.citation,
          doi: RUTTER_2020_SOURCE.doi,
          url: RUTTER_2020_SOURCE.articleUrl,
          publicationYear: 2020,
          sampleSize: metricSummary.n,
        },
        statistics: {
          mean: metricSummary.mean,
          sd: metricSummary.sd,
        },
        derivation: {
          method: `Participant-level ${metric} aggregated by integer source age from OSF project ${RUTTER_2020_SOURCE.osfProject}; no interpolation or percentile derivation. Source SHA-256: ${input.derivation.sourceSha256}`,
          assumptions: [
            'The supplied columns are source-faithful participant-level metrics from the final analytic sample.',
            'Age is supplied at integer-year granularity in the source data.',
            'This DRAFT definition is descriptive evidence only and has no production measurement binding.',
          ],
          distributionAssumption: 'unknown',
          allowEstimatedPercentile: false,
        },
        limitations: metricLimitations(metric),
        disclaimer: '试行文献描述性参考，仅用于与该研究样本的聚合表现进行有边界的比较；不是人口常模、百分位、诊断或能力等级。',
      })
    }
  }

  const definition: AssessmentReferenceSetDefinition = {
    schemaVersion: 1,
    instrumentType: 'cognitive',
    instrumentKey: 'reaction',
    referenceVersion: 'reaction-rutter-2020-descriptive-v1',
    status: 'DRAFT',
    entries,
  }
  const validation = validateReferenceSetDefinition(definition)
  const errors = validation.issues.filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Generated reference set is invalid: ${errors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  return definition
}

interface CliOptions {
  input: string
  output?: string
  mapping: RutterColumnMapping
  filters: EqualityFilter[]
  metrics: ReactionReferenceMetric[]
  minAgeYears: number
  maxAgeYears: number
  minimumAgeBinN: number
}

const usage = () => [
  'Usage:',
  '  npx tsx src/scripts/research/reaction-rutter-2020-derivation.ts \\',
  '    --input=/path/to/source.csv --age-column=AGE --median-column=SRT_MEDIAN --icv-column=SRT_ICV \\',
  '    [--filter=ANALYTIC_SAMPLE=1] [--candidate-metrics=medianRtMs] [--output=/path/to/aggregate.json]',
  '',
  'The command never downloads data and never writes to the application database.',
].join('\n')

const parseCli = (argv: string[]): CliOptions => {
  const values = new Map<string, string[]>()
  argv.forEach((arg) => {
    if (!arg.startsWith('--') || !arg.includes('=')) throw new Error(`Invalid argument: ${arg}\n${usage()}`)
    const [key, ...rest] = arg.slice(2).split('=')
    const value = rest.join('=')
    values.set(key, [...(values.get(key) ?? []), value])
  })
  const required = (key: string): string => {
    const value = values.get(key)?.[0]
    if (!value) throw new Error(`Missing --${key}\n${usage()}`)
    return value
  }
  const filters = (values.get('filter') ?? []).map((filter) => {
    const separator = filter.indexOf('=')
    if (separator <= 0) throw new Error(`Invalid --filter=${filter}; expected COLUMN=VALUE`)
    return { column: filter.slice(0, separator), value: filter.slice(separator + 1) }
  })
  const metrics = (values.get('candidate-metrics')?.[0] ?? '')
    .split(',')
    .filter(Boolean)
    .map((metric) => {
      if (metric !== 'medianRtMs' && metric !== 'rtICV') throw new Error(`Unsupported candidate metric: ${metric}`)
      return metric
    }) as ReactionReferenceMetric[]

  return {
    input: required('input'),
    output: values.get('output')?.[0],
    mapping: {
      age: required('age-column'),
      medianRtMs: required('median-column'),
      rtICV: required('icv-column'),
    },
    filters,
    metrics,
    minAgeYears: Number(values.get('min-age')?.[0] ?? 10),
    maxAgeYears: Number(values.get('max-age')?.[0] ?? 18),
    minimumAgeBinN: Number(values.get('min-bin-n')?.[0] ?? 25),
  }
}

const main = (): void => {
  const options = parseCli(process.argv.slice(2))
  const sourcePath = path.resolve(options.input)
  const csvText = readFileSync(sourcePath, 'utf8')
  const derivation = deriveReactionRutterParticipantMetrics({
    csvText,
    sourceFile: path.basename(sourcePath),
    mapping: options.mapping,
    filters: options.filters,
  })
  const reproduction = verifyRutterPaperSummary(derivation)
  const candidate = options.metrics.length > 0 && reproduction.pass
    ? buildRutterDraftReferenceSet({
        derivation,
        reproduction,
        metrics: options.metrics,
        minAgeYears: options.minAgeYears,
        maxAgeYears: options.maxAgeYears,
        minimumAgeBinN: options.minimumAgeBinN,
      })
    : null
  const output = JSON.stringify({
    source: RUTTER_2020_SOURCE,
    derivation,
    reproduction,
    candidate,
  }, null, 2)
  if (options.output) writeFileSync(path.resolve(options.output), `${output}\n`, 'utf8')
  else process.stdout.write(`${output}\n`)
  if (!reproduction.pass) process.exitCode = 2
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
