import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

export function buildFrequencyReport(entry, formBytes, summary) {
  const digest = createHash('sha256').update(formBytes).digest('hex')
  if (digest !== entry.formSha256) throw new Error('Use the frozen DMEE form listed in the report index')
  if (summary.source !== 'VERIFIED_ENCRYPTED_SURVEY_FINAL' || !Array.isArray(summary.items)) {
    throw new Error('Use the authorized Survey wave item analysis JSON')
  }

  const questions = JSON.parse(formBytes).pages.flatMap(page => page.questions)
  const group = summary.items.filter(item => item.instrumentKey === entry.key)
  if (summary.items.length === 0) {
    return { title: entry.label, contentVersion: '1.0.0', status: 'NO_ITEM_DATA', questions: [] }
  }
  if (group.length !== questions.length) throw new Error('Survey summary does not match the selected DMEE form')

  const items = new Map(group.map(item => [item.itemKey, item]))
  const rows = questions.map(question => {
    const item = items.get(question.itemKey)
    const options = question.options.map(({ optionKey: code, label }) => ({ code, label }))
    if (item?.kind !== 'FORM' || item.responseType !== 'LIKERT' || item.prompt !== question.prompt
      || item.options.length !== options.length
      || item.options.some((actual, index) => actual.code !== options[index].code || actual.label !== options[index].label)) {
      throw new Error('Unexpected frozen DMEE question or categories: ' + question.itemKey)
    }
    const counts = new Map(item.frequencies.map(({ value, count }) => [value, count]))
    const categories = options.map(({ code, label }) => {
      const count = counts.get(code) ?? 0
      return { code, label, count, proportion: item.respondentN ? count / item.respondentN : null }
    })
    const declaredTotal = categories.reduce((sum, category) => sum + category.count, 0)
    if (counts.size !== item.frequencies.length
      || item.frequencies.some(({ value, count }) => !options.some(({ code }) => code === value)
        || !Number.isSafeInteger(count) || count < 0)
      || declaredTotal !== item.respondentN) {
      throw new Error('Invalid DMEE frequency counts: ' + question.itemKey)
    }
    const missing = item.missingByReason
    return {
      itemKey: question.itemKey,
      validCount: item.respondentN,
      categories,
      missing: {
        notShown: missing.NOT_SHOWN ?? 0,
        shownMissing: missing.SHOWN_MISSING ?? 0,
        refused: missing.REFUSED ?? 0,
        exposureUnverified: missing.EXPOSURE_UNVERIFIED ?? 0,
        unableToJudge: missing.UNABLE_TO_JUDGE ?? 0,
      },
    }
  })
  return { title: entry.label, contentVersion: '1.0.0', status: 'OK', questions: rows }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [group, inputPath] = process.argv.slice(2)
  if (!group || !inputPath || process.argv.length !== 4) {
    throw new Error('Usage: node report-summary.mjs GROUP SURVEY-ITEM-ANALYSIS.json')
  }
  const index = readJson(new URL('./index.json', import.meta.url))
  const entry = index.find(item => item.code === group)
  if (!entry) throw new Error('Unknown DMEE group: ' + group)
  const payload = readJson(inputPath)
  const bytes = readFileSync(new URL(entry.formPath, import.meta.url))
  process.stdout.write(JSON.stringify(buildFrequencyReport(entry, bytes, payload.data ?? payload), null, 2) + '\n')
}
