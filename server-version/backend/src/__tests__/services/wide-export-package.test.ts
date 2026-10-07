import { expect, it } from 'vitest'
import { wideExportPackage } from '../../services/wideExportPackage'

it('packages a standard CSV and matching frozen dictionary without inventing units or cross-resource identity', () => {
  const csv = 'U_id,rt,quality,definition_hash\nU123,350,limited,abcdef\n'
  const bytes = wideExportPackage(csv, [
    { name: 'U_id', label: '参与者编号', type: 'string' },
    { name: 'rt', label: '反应时', type: 'numeric', unit: 'ms' },
    { name: 'quality', label: '质量状态', type: 'string', allowedValues: ['interpretable', 'limited', 'invalid'] },
    { name: 'definition_hash', label: '冻结版本', type: 'string' },
  ], { resourceType: 'COMPOSITE', resourceId: 'synthetic', detail: 'summary' })
  const entries: Record<string, string> = {}
  let offset = 0
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28)
    const start = offset + 30 + nameLength + extraLength
    entries[bytes.subarray(offset + 30, offset + 30 + nameLength).toString()] = bytes.subarray(start, start + size).toString('utf8')
    offset = start + size
  }
  expect(Object.keys(entries)).toEqual(['data.csv', 'data_dictionary.json', 'README.txt'])
  expect(entries['data.csv']).toBe('\uFEFF' + csv)
  const dictionary = JSON.parse(entries['data_dictionary.json'])
  expect(dictionary.columns.map((column: any) => column.name)).toEqual(csv.split('\n')[0].split(','))
  expect(dictionary.columns[1].unit).toBe('ms')
  expect(dictionary.columns[0].unit).toBeNull()
  expect(dictionary.frozenVersionColumns).toEqual(['definition_hash'])
  expect(dictionary.schemaVersion).toMatch(/^[a-f0-9]{64}$/)
  expect(dictionary.linkage).toContain('不保证跨测评稳定或唯一')
  expect(JSON.stringify(dictionary)).not.toContain('U123')
})
