import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))

function readCount(value, column, item) {
  const count = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(count)) {
    throw new Error(`Invalid count for ${column} at item ${item}`)
  }
  return count
}

function percent(count, denominator) {
  return denominator === 0 ? '—' : `${(100 * count / denominator).toFixed(1)}%`
}

export function renderGroupFeedback(aggregateCsv, locale) {
  const text = manifest.reportLabels[locale]
  if (!text) throw new Error('Choose en or zh-CN for the report language')
  const lines = aggregateCsv.trim().split(/\r?\n/)
  const header = lines.shift()?.split(',')
  const form = manifest.forms.find(item => item.catalogKey === lines[0]?.split(',')[0])
  if (!form) throw new Error('The CSV must identify a form from this report package')
  const { columns, labels } = manifest.responseSets[form.responseSet]
  const expectedHeader = ['catalog_key', 'source_sha256', 'item_number', ...columns]
  if (header?.join(',') !== expectedHeader.join(',')) {
    throw new Error(`Expected CSV header ${expectedHeader.join(',')}`)
  }
  if (lines.length !== form.numberedCount) {
    throw new Error(`Expected ${form.numberedCount} numbered item rows`)
  }

  const itemNumbers = new Set()
  let groupSize
  const rows = lines.map(line => {
    const values = line.split(',')
    const [key, digest, itemValue, ...counts] = values
    const item = readCount(itemValue, 'item_number', itemValue)
    if (key !== form.catalogKey || digest !== form.sourceSha256 ||
        item < 1 || item > form.numberedCount || itemNumbers.has(item) || values.length !== expectedHeader.length) {
      throw new Error(`Form revision or item numbering mismatch at item ${item}`)
    }
    itemNumbers.add(item)

    const orderedCounts = counts.map((value, index) => readCount(value, columns[index], item))
    const groupTotal = orderedCounts.reduce((sum, count) => sum + count)
    if (!Number.isSafeInteger(groupTotal) || groupTotal === 0 ||
        (groupSize !== undefined && groupTotal !== groupSize)) {
      throw new Error(`Category counts, blank and any not applicable must sum to the same group size at item ${item}`)
    }
    groupSize = groupTotal

    const validCount = orderedCounts.reduce((sum, count, index) => sum +
      (['blank', 'not_applicable'].includes(columns[index]) ? 0 : count), 0)
    const cells = orderedCounts.map((count, index) =>
      ['blank', 'not_applicable'].includes(columns[index]) ? String(count) : `${count} (${percent(count, validCount)})`)
    return { item, cells: [item, validCount, ...cells] }
  })

  const headings = [text.item, text.valid, ...labels[locale]]
  const tableLine = cells => `| ${cells.join(' | ')} |`
  const content = form.content[locale]
  return [
    `# ${content.title}`,
    '',
    '![' + (locale === 'en' ? form.illustrationAltEn : form.illustrationAlt) + '](' + form.artwork + ')',
    '',
    content.lead,
    '',
    `${text.form} ${form.title[locale]}  `,
    `${text.groupSize} ${groupSize}`,
    '',
    text.denominator,
    '',
    tableLine(headings),
    tableLine(headings.map(() => '---')),
    ...rows.sort((a, b) => a.item - b.item).map(row => tableLine(row.cells)),
    '',
    `## ${text.action}`,
    '',
    content.action,
    '',
    content.scope,
    '',
    `[${text.source}](${form.officialSource}) · [${text.protocol}](${form.administrationProtocol})`,
    `<!-- ${form.catalogKey} ${form.sourceSha256} -->`,
    '',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [locale, filename] = process.argv.slice(2)
  if (process.argv.length !== 4 || !filename) {
    throw new Error('Usage: node render-report.mjs zh-CN|en anonymous-item-counts.csv')
  }
  process.stdout.write(renderGroupFeedback(readFileSync(filename, 'utf8'), locale))
}
