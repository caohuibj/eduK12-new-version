import { XMLParser, XMLValidator } from 'fast-xml-parser'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { SjtTemplateError, type SjtAuthorTemplate, type SjtAuthorIssue } from './template'

export const SJT_WORKBOOK_TABLES = [
  {
    name: '节点',
    key: 'nodes',
    fields: ['nodeKey', 'motherSceneKey', 'title', 'stimulus'],
    labels: ['节点标识', '母场景标识', '标题', '题面'],
  },
  {
    name: '题目',
    key: 'questions',
    fields: [
      'nodeKey',
      'questionKey',
      'prompt',
      'kind',
      'purpose',
      'required',
      'order',
      'maxLength',
    ],
    labels: [
      '节点标识',
      '题目标识',
      '题干',
      '类型 CORE/ORDINAL/NOMINAL/TEXT',
      '用途',
      '必需响应 true/false',
      '顺序',
      '文字长度上限',
    ],
  },
  {
    name: '选项',
    key: 'options',
    fields: ['questionKey', 'optionKey', 'label', 'nonanswerReason'],
    labels: ['题目标识', '选项标识', '选项文字', '非回答 UNABLE_TO_JUDGE/DECLINED'],
  },
  {
    name: '过渡',
    key: 'transitions',
    fields: ['nodeKey', 'optionKey', 'nextNodeKey', 'bridgeText'],
    labels: ['节点标识', '核心选项', '下一节点或 END', '过渡句（可空）'],
  },
  {
    name: '指标',
    key: 'metrics',
    fields: ['metricKey', 'label', 'construct', 'role'],
    labels: ['指标标识', '名称', '构念标识', '角色 primary/secondary'],
  },
  {
    name: '评分机会',
    key: 'opportunities',
    fields: ['nodeKey', 'metricKey', 'applicability'],
    labels: ['节点标识', '指标标识', 'OPPORTUNITY/NA'],
  },
  {
    name: '评分键',
    key: 'scores',
    fields: ['nodeKey', 'optionKey', 'metricKey', 'contribution'],
    labels: ['节点标识', '有效核心选项', '指标标识', '贡献（零须明确填写）'],
  },
  {
    name: '报告片段',
    key: 'feedback',
    fields: ['questionKey', 'optionKey', 'kind', 'text'],
    labels: ['题目标识', '选项标识', 'ACTION/PROBE/GUIDANCE', '片段文字'],
  },
  {
    name: '重复题比较',
    key: 'comparisons',
    fields: ['motherSceneKey', 'firstChannelKey', 'secondChannelKey', 'label', 'categories'],
    labels: ['母场景标识', '前次题目', '后次题目', '描述标题', '类别顺序（竖线分隔）'],
  },
  {
    name: '验收作答',
    key: 'caseResponses',
    fields: ['name', 'nodeKey', 'questionKey', 'responseValue'],
    labels: ['样例名称', '节点标识', '题目标识', '原始回答'],
  },
  {
    name: '验收期望',
    key: 'caseExpected',
    fields: ['name', 'metricKey', 'expectedValue'],
    labels: ['样例名称', '指标标识', '期望合计（缺失填 null）'],
  },
] as const
export const SJT_BASIC_FIELDS = [
  'templateVersion',
  'instrumentKey',
  'instrumentVersion',
  'title',
  'respondentType',
  'entryNodeKey',
  'author',
  'sourceNote',
  'disclaimer',
  'licenseStatus',
  'redistribution',
] as const

/** Bound actual decompression before the workbook reader; declarations alone are insufficient. */
export function validateSjtXlsxContainer(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length > 2 * 1024 * 1024 || buffer.length < 22) throw new Error('模板大小上限为 2 MB')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  if (
    end < 0 ||
    end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length ||
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6)
  )
    throw new Error('无效或不支持的 Excel 容器')
  const count = buffer.readUInt16LE(end + 10),
    directory = buffer.readUInt32LE(end + 16),
    size = buffer.readUInt32LE(end + 12)
  if (count > 200 || directory + size !== end || buffer.readUInt16LE(end + 8) !== count)
    throw new Error('模板容器超限')
  let cursor = directory,
    total = 0
  const names = new Set<string>(),
    files = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('无效目录')
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      uncompressed = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32),
      local = buffer.readUInt32LE(cursor + 42)
    if (cursor + 46 + nameLength + extra + comment > end) throw new Error('无效目录范围')
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (
      names.has(name) ||
      !/^[a-zA-Z0-9_./\[\]-]+$/.test(name) ||
      name.includes('..') ||
      name.startsWith('/') ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      uncompressed > 8 * 1024 * 1024 ||
      compressed > buffer.length ||
      local + 30 > directory ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('不支持的模板内容')
    names.add(name)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + compressed > directory) throw new Error('无效压缩范围')
    const bytes = buffer.subarray(start, start + compressed)
    const decoded =
      method === 8 ? inflateRawSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }) : bytes
    files.set(name, decoded)
    total += decoded.length
    if (decoded.length !== uncompressed || total > 12 * 1024 * 1024) throw new Error('模板解压超限')
    if (
      /vba|externalLinks|embeddings/i.test(name) ||
      (name.endsWith('.rels') &&
        /TargetMode\s*=\s*["']External["']/i.test(decoded.toString('utf8')))
    )
      throw new Error('模板不可含宏、嵌入文件或外部链接')
    cursor += 46 + nameLength + extra + comment
  }
  if (cursor !== end || !names.has('xl/workbook.xml')) throw new Error('不是受支持的 Excel 模板')
  return files
}

interface SjtCell {
  value: unknown
  address: string
  worksheet: { name: string }
}
interface SjtSheet {
  name: string
  rowCount: number
  columnCount: number
  getCell: (row: number, col: number) => SjtCell
}
const array = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]
/** Namespace-aware standard OOXML, including prefixed XML and absolute internal relationships. */
function readXmlWorkbook(files: Map<string, Buffer>) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  })
  const xml = (name: string) => {
    const bytes = files.get(name)
    if (!bytes) throw new Error(`模板缺少 ${name}`)
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '')
    if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true)
      throw new Error('XML 无效或包含不支持的实体声明')
    return parser.parse(text)
  }
  const shared = files.has('xl/sharedStrings.xml')
    ? array<Record<string, unknown>>(xml('xl/sharedStrings.xml').sst?.si).map((s) =>
        typeof s.t === 'string'
          ? s.t
          : s.t && typeof s.t === 'object'
            ? (s.t as Record<string, unknown>)['#text']
            : s.r
              ? { richText: true }
              : '',
      )
    : []
  if (shared.length > 40000) throw new Error('模板字符串数量超限')
  const rels = array<Record<string, string>>(
    xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship,
  )
  const sheets = array<Record<string, string>>(xml('xl/workbook.xml').workbook?.sheets?.sheet)
  if (sheets.length > 13 || new Set(sheets.map((s) => s['@_name'])).size !== sheets.length)
    throw new Error('工作表数量超限或重复')
  const worksheets: SjtSheet[] = sheets.map((s) => {
    const name = s['@_name']!,
      rel = rels.find((r) => r['@_Id'] === s['@_id'])
    if (!rel || !rel['@_Type']?.endsWith('/worksheet') || rel['@_TargetMode'] === 'External')
      throw new Error('无效工作表关系')
    const target = rel['@_Target'].startsWith('/')
      ? rel['@_Target'].slice(1)
      : path.posix.normalize(`xl/${rel['@_Target']}`)
    if (!/^xl\/worksheets\/[a-zA-Z0-9_-]+\.xml$/.test(target)) throw new Error('不支持的工作表路径')
    const worksheet = xml(target).worksheet
    if (worksheet?.hyperlinks || worksheet?.oleObjects)
      throw new Error('模板不可含超链接或嵌入对象')
    const data = worksheet?.sheetData
    const cells = new Map<string, unknown>()
    let rowCount = 0,
      columnCount = 0
    for (const row of array<Record<string, unknown>>(data?.row))
      for (const c of array<Record<string, unknown>>(
        row.c as Record<string, unknown> | Record<string, unknown>[] | undefined,
      )) {
        const address = String(c['@_r']),
          match = /^([A-Z]{1,2})([1-9][0-9]{0,3})$/.exec(address)
        if (!match) throw new Error('单元格地址无效或超限')
        const rowIndex = Number(match[2]),
          colIndex = [...match[1]!].reduce((v, ch) => v * 26 + ch.charCodeAt(0) - 64, 0)
        if (rowIndex > 5000 || colIndex > 8 || cells.has(address) || cells.size > 40000)
          throw new Error('单元格数量或地址超限')
        rowCount = Math.max(rowCount, rowIndex)
        columnCount = Math.max(columnCount, colIndex)
        const type = c['@_t']
        let value: unknown = null
        if ('f' in c || type === 'e') value = { unsupported: true }
        else if (type === 's') {
          const index = Number(c.v)
          if (!Number.isInteger(index) || index < 0 || index >= shared.length)
            throw new Error('无效字符串引用')
          value = shared[index]
        } else if (type === 'inlineStr') {
          const inline = c.is as Record<string, unknown>
          const t = inline?.t
          value = inline?.r
            ? { richText: true }
            : typeof t === 'object' && t
              ? ((t as Record<string, unknown>)['#text'] ?? '')
              : (t ?? null)
        } else if (type === 'b') {
          if (c.v !== '0' && c.v !== '1') throw new Error('布尔值无效')
          value = c.v === '1'
        } else if (c.v !== undefined && c.v !== '') {
          value = type === 'str' ? c.v : Number(c.v)
          if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('数字无效')
        }
        cells.set(address, value)
      }
    return {
      name,
      rowCount,
      columnCount,
      getCell: (r, c) => {
        const address = `${String.fromCharCode(64 + c)}${r}`
        return { value: cells.get(address) ?? null, address, worksheet: { name } }
      },
    }
  })
  return { worksheets, getWorksheet: (name: string) => worksheets.find((s) => s.name === name) }
}

const workbookLocations = new WeakMap<object, Map<string, string>>()
export function locateSjtWorkbookIssues(
  input: unknown,
  issues: SjtAuthorIssue[],
): SjtAuthorIssue[] {
  const locations = input && typeof input === 'object' ? workbookLocations.get(input) : undefined
  if (!locations) return issues
  return issues.map((i) => {
    const parts = i.path.split('.'),
      spec = SJT_WORKBOOK_TABLES.find((s) => s.key === parts[0])
    const cell =
      locations.get(i.path) ??
      locations.get(parts.slice(0, 2).join('.')) ??
      locations.get(parts[0]!)
    return {
      ...i,
      path: cell ? `${cell}（${i.path}）` : spec ? `${spec.name}（${i.path}）` : i.path,
    }
  })
}
export async function readSjtWorkbook(buffer: Buffer): Promise<unknown> {
  const wb = readXmlWorkbook(validateSjtXlsxContainer(buffer))
  const locations = new Map<string, string>()
  const allowed = new Set<string>([
    '填写说明',
    '基本信息',
    ...SJT_WORKBOOK_TABLES.map((t) => t.name),
  ])
  const errors: Array<{ code: string; path: string; message: string }> = []
  for (const sheet of wb.worksheets)
    if (!allowed.has(sheet.name))
      errors.push({ code: 'SHEET', path: sheet.name, message: '未知工作表' })
  let cells = 0
  const scalar = (cell: SjtCell): string | number | boolean | null => {
    cells++
    if (cells > 80000) throw new Error('模板单元格超限')
    const v = cell.value
    if (v === null || v === undefined) return null
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
      if (String(v).length > 16000) throw new Error('单元格文字超限')
      return typeof v === 'string' ? v.trim() : v
    }
    errors.push({
      code: 'CELL',
      path: `${cell.worksheet.name}!${cell.address}`,
      message: '仅支持文字、数字和布尔值；不支持公式、链接或富文本',
    })
    return null
  }
  const basic = wb.getWorksheet('基本信息'),
    result: Record<string, unknown> = {}
  if (!basic || basic.rowCount > 100) throw new Error('缺少基本信息或行数超限')
  for (let r = 2; r <= basic.rowCount; r++) {
    const field = scalar(basic.getCell(r, 1)),
      value = scalar(basic.getCell(r, 2))
    if (!field && !value) continue
    if (
      !SJT_BASIC_FIELDS.includes(field as (typeof SJT_BASIC_FIELDS)[number]) ||
      Object.prototype.hasOwnProperty.call(result, String(field))
    )
      errors.push({ code: 'FIELD', path: `基本信息!A${r}`, message: '未知或重复字段' })
    else {
      result[String(field)] = value
      locations.set(String(field), `基本信息!B${r}`)
    }
  }
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const spec of SJT_WORKBOOK_TABLES) {
    const sheet = wb.getWorksheet(spec.name)
    if (!sheet || sheet.rowCount > 5000 || sheet.columnCount > spec.fields.length) {
      errors.push({ code: 'SHEET', path: spec.name, message: '缺少工作表或超过行列限制' })
      continue
    }
    const headers = spec.fields.map(
      (_, c) => String(scalar(sheet.getCell(1, c + 1)) ?? '').split('｜')[0],
    )
    if (headers.join() !== spec.fields.join()) {
      errors.push({ code: 'HEADER', path: `${spec.name}!1`, message: '字段顺序与模板不一致' })
      continue
    }
    const rows: Record<string, unknown>[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
      const values = spec.fields.map((_, c) => scalar(sheet.getCell(r, c + 1)))
      if (values.every((v) => v === null || v === '')) continue
      const out: Record<string, unknown> = {}
      for (let c = 0; c < spec.fields.length; c++) {
        const field = spec.fields[c]!,
          v = values[c]
        if (v === null || v === '') {
          if (field === 'bridgeText') out[field] = ''
          continue
        }
        if (['order', 'maxLength', 'contribution', 'expectedValue'].includes(field)) {
          if (field === 'expectedValue' && v === 'null') out[field] = null
          else if (typeof v === 'number') out[field] = v
          else
            errors.push({
              code: 'NUMBER',
              path: `${spec.name}!${sheet.getCell(r, c + 1).address}`,
              message: '需填写数字；缺失期望值填 null，不能用空白代替零',
            })
        } else if (field === 'required') {
          if (v === true || v === false || v === 'true' || v === 'false')
            out[field] = v === true || v === 'true'
          else
            errors.push({
              code: 'BOOLEAN',
              path: `${spec.name}!${sheet.getCell(r, c + 1).address}`,
              message: '填写 true 或 false',
            })
        } else if (field === 'categories') out[field] = String(v).split('|')
        else out[field] = String(v)
      }
      locations.set(`${spec.key}.${rows.length}`, `${spec.name}!第${r}行`)
      for (const [i, field] of spec.fields.entries())
        locations.set(
          `${spec.key}.${rows.length}.${field}`,
          `${spec.name}!${String.fromCharCode(65 + i)}${r}`,
        )
      rows.push(out)
    }
    tables[spec.key] = rows
  }
  if (errors.length) throw new SjtTemplateError(errors)
  for (const spec of SJT_WORKBOOK_TABLES)
    if (!spec.key.startsWith('case')) result[spec.key] = tables[spec.key]
  const cases = new Map<string, SjtAuthorTemplate['cases'][number]>()
  for (const r of tables.caseResponses ?? []) {
    const name = String(r.name),
      c = cases.get(name) ?? { name, responses: [], expected: {} }
    c.responses.push({
      nodeKey: String(r.nodeKey),
      questionKey: String(r.questionKey),
      responseValue: String(r.responseValue ?? ''),
    })
    cases.set(name, c)
  }
  for (const r of tables.caseExpected ?? []) {
    const c = cases.get(String(r.name))
    if (!c || Object.prototype.hasOwnProperty.call(c.expected, String(r.metricKey)))
      errors.push({ code: 'CASE', path: '验收期望', message: '样例不存在或期望指标重复' })
    else c.expected[String(r.metricKey)] = r.expectedValue as number | null
  }
  if (errors.length) throw new SjtTemplateError(errors)
  result.cases = [...cases.values()]
  workbookLocations.set(result, locations)
  return result
}
