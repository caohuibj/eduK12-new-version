import { createHash } from 'node:crypto'
import { buildZipStore } from '../modules/cognitive/export-zip'
import { assertExportLimits } from './exportStorage'

export type DictionaryField = {
  name: string; label: string; type: string; unit?: string | null
  allowedValues?: unknown[]; missingMeaning?: string
}

/** Receives the already-authorized, materialized export. Never queries or
 * rebuilds fields from live definitions after disclosure projection. */
export function wideExportPackage(csv: string, fields: DictionaryField[], source: { resourceType: 'COGNITIVE' | 'COMPOSITE'; resourceId: string; detail: string }) {
  const columns = fields.map(field => ({
    name: field.name, label: field.label, type: field.type, unit: field.unit ?? null,
    allowedValues: field.allowedValues ?? null,
    missingMeaning: field.missingMeaning ?? '未作答、来源不可用、无法计算或按披露规则隐藏；请结合质量及版本列判断',
  }))
  const schemaVersion = createHash('sha256').update(JSON.stringify(columns)).digest('hex')
  const dictionary = {
    dictionaryVersion: 1, schemaVersion, source, columns,
    frozenVersionColumns: fields.filter(field => /version|hash/.test(field.name)).map(field => field.name),
    linkage: '参与者编号只按本次数据来源解释，不保证跨测评稳定或唯一。关联请核对本次记录标识与冻结版本，勿仅凭 U_id 合并不同测评。',
  }
  assertExportLimits({ bytes: Buffer.byteLength(csv, 'utf8'), fields: fields.length })
  const bytes = buildZipStore([
    { name: 'data.csv', data: '\uFEFF' + csv },
    { name: 'data_dictionary.json', data: JSON.stringify(dictionary, null, 2) + '\n' },
    { name: 'README.txt', data: `数据与字典来自同一次获授权导出。\n字段 schemaVersion：${schemaVersion}\nCSV 首行为标准列名，不含注释。单位或允许值为空表示冻结定义未提供，不能推断。\n${dictionary.linkage}\n结果仅供冻结定义允许的解释，不构成诊断或新常模。\n` },
  ])
  assertExportLimits({ bytes: bytes.length })
  return bytes
}
