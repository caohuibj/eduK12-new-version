import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function summarizeGroup(entry, itemCounts) {
  const expected = entry.itemCodes
  if (Object.keys(itemCounts).length !== expected.length || expected.some(code => !Object.hasOwn(itemCounts, code))) {
    throw new Error('Provide exactly the item codes for the selected Q34 group')
  }
  return expected.map(code => {
    const { options, missing = 0 } = itemCounts[code]
    if (!Array.isArray(options) || options.length !== 4 ||
        [...options, missing].some(n => !Number.isSafeInteger(n) || n < 0)) {
      throw new Error('Counts must be four nonnegative integers and a blank count')
    }
    const valid = options.reduce((sum, n) => sum + n, 0)
    if (!Number.isSafeInteger(valid) || !Number.isSafeInteger(valid + missing)) throw new Error('Total count out of range')
    return {
      code, valid, missing,
      categories: options.map((count, i) => ({
        value: i + 1, label: entry.options[i], count, proportion: valid ? count / valid : null,
      })),
    }
  })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [variant, filename] = process.argv.slice(2)
  const index = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))
  const entry = index.find(row => row.id === variant)
  if (!entry || !filename) throw new Error('Usage: node report-summary.mjs GROUP item-counts.json')
  const counts = JSON.parse(readFileSync(filename, 'utf8'))
  console.log(JSON.stringify({
    group: variant, title: entry.title, language: 'zh-CN',
    source: entry.questionnaireArchive, items: summarizeGroup(entry, counts),
  }, null, 2))
}
