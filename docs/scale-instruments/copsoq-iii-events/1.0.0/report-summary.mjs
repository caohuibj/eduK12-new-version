import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function summarizeQuestion(question, undefinedCode = null) {
  const count = new Map(question.frequencies.map(option => [option.value, option.count]))
  const structuralMissing = undefinedCode ? count.get(undefinedCode) ?? 0 : 0
  const emptySelection = question.responseType === 'MULTIPLE'
    ? question.combinationFrequencies.find(choice => choice.value === '[]')?.count ?? 0
    : 0
  const validCount = question.respondentN - structuralMissing - emptySelection
  return {
    validCount,
    ...(question.responseType === 'MULTIPLE' ? { multipleResponses: true } : {}),
    categories: question.options.filter(option => option.code !== undefinedCode).map(option => {
      const n = count.get(option.code) ?? 0
      return { code: option.code, label: option.label, count: n,
        proportion: validCount ? n / validCount : null }
    }),
    missing: {
      notShown: question.missingByReason.NOT_SHOWN ?? 0,
      shownMissing: (question.missingByReason.SHOWN_MISSING ?? 0) + emptySelection,
      refused: question.missingByReason.REFUSED ?? 0,
      ...(undefinedCode ? { structurallyNotApplicable: structuralMissing } : {}),
    },
  }
}

/** Use the existing authorized Survey descriptive item summary as input.
 * This projection contains no respondent identifiers, raw answers, exact
 * source combinations, scores, relative ranks or clinical judgments.
 */
export function buildEventReport(entry, items) {
  const code = entry.code.toLowerCase()
  const query = (kind, itemKey, type) => {
    const instrumentKey = 'copsoq3_' + code + '_' + kind
    const item = items.find(q => q.instrumentKey === instrumentKey && q.itemKey === itemKey)
    if (!item || item.responseType !== type || item.kind !== 'FORM') {
      throw new Error('Missing or mismatched Survey summary item: ' + instrumentKey + '/' + itemKey)
    }
    return item
  }
  const ordered = [{ kind: 'frequency',
    ...summarizeQuestion(query('frequency', entry.claims.frequencyItemKey, 'SINGLE')) }]
  if (entry.claims.sourceItemKey) {
    ordered.push({ kind: 'sources',
      ...summarizeQuestion(query('source', entry.claims.sourceItemKey, 'MULTIPLE')) })
  }
  if (entry.claims.independentItemKey) {
    ordered.push({ kind: 'independentFrequency',
      ...summarizeQuestion(query('independent', entry.claims.independentItemKey, 'SINGLE'), 'not_applicable') })
  }
  return { title: entry.title, originalSource: entry.sourceUrl, edition: entry.version, questions: ordered }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [code, file] = process.argv.slice(2)
  if (!code || !file || process.argv.length !== 4) {
    throw new Error('Usage: node report-summary.mjs EVENT_CODE survey-descriptive-summary.json')
  }
  const fileContents = JSON.parse(readFileSync(file, 'utf8'))
  const data = fileContents.data ?? fileContents
  const entries = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))
  const entry = entries.find(item => item.code === code.toUpperCase())
  if (!entry || !Array.isArray(data.items)) throw new Error('Choose a recognized event and an authorized Survey descriptive summary')
  process.stdout.write(JSON.stringify(buildEventReport(entry, data.items), null, 2) + '\n')
}
